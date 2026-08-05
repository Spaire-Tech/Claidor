"""Backfill course enrollments from active subscriptions too

Revision ID: 5b9f3e7a2c08
Revises: 8e1f47a09c52
Create Date: 2026-05-24 09:15:00.000000

The first backfill (8e1f47a09c52) only enrolled customers off the
`orders` table with status IN ('paid', 'partially_refunded'). That
misses anyone on a recurring product who hasn't been billed yet
(trialing / incomplete on initial signup) or whose order rows live
under statuses we didn't enumerate. The Customers tab therefore kept
showing only the org admin even after backfill.

This migration enrolls everyone who has either:

  • a non-pending order on the course's product, OR
  • a non-incomplete subscription on the course's product
    (active, trialing, past_due, canceled — same set Polar already
    treats as "had access at some point", and matches how the live
    benefit-grant pipeline reacts to subscription create events).

Inserts skip rows where an active CourseEnrollment already exists,
so it's safe to re-run.

"""

from alembic import op

revision = "5b9f3e7a2c08"
down_revision = "8e1f47a09c52"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        WITH paid_via_orders AS (
            SELECT
                c.id          AS course_id,
                c.product_id  AS product_id,
                o.customer_id AS customer_id,
                MIN(o.created_at) AS first_paid_at
            FROM courses c
            JOIN orders o ON o.product_id = c.product_id
            WHERE c.deleted_at IS NULL
              AND c.product_id IS NOT NULL
              AND o.deleted_at IS NULL
              AND o.status <> 'pending'
            GROUP BY c.id, c.product_id, o.customer_id
        ),
        paid_via_subscriptions AS (
            SELECT
                c.id          AS course_id,
                c.product_id  AS product_id,
                s.customer_id AS customer_id,
                MIN(s.created_at) AS first_paid_at
            FROM courses c
            JOIN subscriptions s ON s.product_id = c.product_id
            WHERE c.deleted_at IS NULL
              AND c.product_id IS NOT NULL
              AND s.deleted_at IS NULL
              AND s.status NOT IN ('incomplete', 'incomplete_expired')
            GROUP BY c.id, c.product_id, s.customer_id
        ),
        access AS (
            SELECT * FROM paid_via_orders
            UNION
            SELECT * FROM paid_via_subscriptions
        ),
        collapsed AS (
            -- A customer may show up in both CTEs (one-time top-up + a
            -- subscription on the same product). Collapse to one row
            -- per (course, customer) keyed to the earliest access date.
            SELECT
                course_id,
                product_id,
                customer_id,
                MIN(first_paid_at) AS first_paid_at
            FROM access
            GROUP BY course_id, product_id, customer_id
        )
        INSERT INTO course_enrollments (
            id, created_at, modified_at,
            customer_id, course_id, product_id, enrolled_at
        )
        SELECT
            gen_random_uuid(),
            now(),
            now(),
            a.customer_id,
            a.course_id,
            a.product_id,
            a.first_paid_at
        FROM collapsed a
        WHERE NOT EXISTS (
            SELECT 1
            FROM course_enrollments ce
            WHERE ce.customer_id = a.customer_id
              AND ce.course_id   = a.course_id
              AND ce.deleted_at IS NULL
        );
        """
    )


def downgrade() -> None:
    # Non-destructive — same rationale as the first backfill.
    pass

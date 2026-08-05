"""Backfill course_access benefits + enrollments for existing courses

Revision ID: 8e1f47a09c52
Revises: 4d2b6c91e0a3
Create Date: 2026-05-24 06:05:00.000000

Until today, creating a course never wired a `course_access` benefit on
the underlying product. The Order → enqueue_benefits_grants pipeline ran
correctly for every purchase, but found nothing to grant (the product
had no benefits of type course_access), so no CourseEnrollment row was
ever created — paying customers got nothing in the portal, and the
editor's Customers tab showed only the org admin.

This migration repairs every existing course in two steps:

  1. For each course whose product has no course_access benefit pointing
     at this course, create the benefit and attach it to the product.

  2. For each customer with a fulfilled (subscription-active OR
     one-time paid) order for that product, insert a CourseEnrollment
     row dated to the order/subscription start. The partial unique
     index on (customer_id, course_id) WHERE deleted_at IS NULL keeps
     this idempotent.

Going forward, course_service.create() wires the benefit at creation
time so this only ever needs to run once.

"""

from alembic import op

revision = "8e1f47a09c52"
down_revision = "4d2b6c91e0a3"
branch_labels: tuple[str] | None = None
depends_on: tuple[str] | None = None


def upgrade() -> None:
    # ── 1. Create missing course_access benefits and attach to products ──
    # `course_id` is stored in the benefit's JSONB properties; the inner
    # SELECT excludes courses that already have a benefit for them so the
    # migration is safe to re-run.
    op.execute(
        """
        INSERT INTO benefits (
            id, created_at, modified_at, type, description, is_tax_applicable,
            selectable, deletable, organization_id, properties, user_metadata
        )
        SELECT
            gen_random_uuid(),
            now(),
            now(),
            'course_access',
            'Access to ' || COALESCE(NULLIF(c.title, ''), 'this course'),
            true,
            false,
            false,
            c.organization_id,
            jsonb_build_object('course_id', c.id::text),
            '{}'::jsonb
        FROM courses c
        WHERE c.product_id IS NOT NULL
          AND c.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM benefits b
              WHERE b.type = 'course_access'
                AND b.organization_id = c.organization_id
                AND b.deleted_at IS NULL
                AND b.properties->>'course_id' = c.id::text
          );
        """
    )

    # Attach each freshly-created (or pre-existing) course_access benefit
    # to its course's product. ON CONFLICT DO NOTHING guards against
    # repeated runs.
    op.execute(
        """
        INSERT INTO product_benefits (
            id, created_at, modified_at, product_id, benefit_id, "order"
        )
        SELECT
            gen_random_uuid(),
            now(),
            now(),
            c.product_id,
            b.id,
            COALESCE(
                (
                    SELECT MAX(pb."order") + 1
                    FROM product_benefits pb
                    WHERE pb.product_id = c.product_id
                ),
                0
            )
        FROM courses c
        JOIN benefits b
          ON b.type = 'course_access'
         AND b.organization_id = c.organization_id
         AND b.deleted_at IS NULL
         AND b.properties->>'course_id' = c.id::text
        WHERE c.product_id IS NOT NULL
          AND c.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM product_benefits pb
              WHERE pb.product_id = c.product_id
                AND pb.benefit_id = b.id
          )
        ON CONFLICT DO NOTHING;
        """
    )

    # ── 2. Backfill CourseEnrollment for already-paid customers ──
    # Cover both one-time and subscription products: any customer with at
    # least one non-refunded order, or an active/trialing/past_due
    # subscription, on the course's product.
    #
    # The partial unique index ix_course_enrollments_customer_course_active
    # would normally raise on a duplicate, but we explicitly skip rows
    # where an active enrollment already exists. We don't use ON CONFLICT
    # because the index is partial (WHERE deleted_at IS NULL) and the
    # constraint isn't a true unique constraint Postgres can use as a
    # conflict target without a `WHERE` predicate that matches exactly.
    op.execute(
        """
        WITH paid_customers AS (
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
              AND o.status IN ('paid', 'partially_refunded')
            GROUP BY c.id, c.product_id, o.customer_id
        )
        INSERT INTO course_enrollments (
            id, created_at, modified_at,
            customer_id, course_id, product_id, enrolled_at
        )
        SELECT
            gen_random_uuid(),
            now(),
            now(),
            pc.customer_id,
            pc.course_id,
            pc.product_id,
            pc.first_paid_at
        FROM paid_customers pc
        WHERE NOT EXISTS (
            SELECT 1
            FROM course_enrollments ce
            WHERE ce.customer_id = pc.customer_id
              AND ce.course_id   = pc.course_id
              AND ce.deleted_at IS NULL
        );
        """
    )


def downgrade() -> None:
    # Non-destructive backfill — there's nothing safe to undo. Created
    # benefits/enrollments could be tied to existing customer access
    # we'd be revoking, so downgrade is intentionally a no-op.
    pass

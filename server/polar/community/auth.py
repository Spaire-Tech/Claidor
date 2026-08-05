"""Auth dependencies for the Community module.

Two surfaces, two dependencies:

  CommunityCreatorWrite
    Routes that the course's creator/admins call from the dashboard
    (settings PATCH, moderation, pin/unpin). Rides the same
    Authenticator as course.auth.CoursesWrite so the same scopes that
    let a user edit a course let them edit its community.

  CommunityCustomerRead / CommunityCustomerWrite
    Routes that enrolled students call from the customer portal.
    Composes customer_portal.auth.CustomerPortalUnionRead — meaning
    both Customer and Member subjects are accepted (the latter is a
    seat-claimed member auth subject, mid-migration in this codebase).

Endpoint code that needs to confirm the actor is enrolled in a specific
course should additionally call community_service.assert_enrolled(...)
because the auth dependencies above don't know which course is being
addressed — the path param decides that, not the token.
"""

from typing import Annotated

from fastapi import Depends

from polar.auth.dependencies import Authenticator
from polar.auth.models import (
    AuthSubject,
    Customer,
    Member,
    Organization,
    User,
)
from polar.auth.scope import Scope

# ----------------------------------------------------------------------
# Creator side — mirrors course.auth.CoursesWrite. We reuse the same
# scope set so a single PAT can drive both the course editor and its
# community tab without re-issuing tokens.
# ----------------------------------------------------------------------
_CommunityCreatorWrite = Authenticator(
    required_scopes={
        Scope.web_write,
        Scope.products_write,
    },
    allowed_subjects={User, Organization},
)
CommunityCreatorWrite = Annotated[
    AuthSubject[User | Organization], Depends(_CommunityCreatorWrite)
]

_CommunityCreatorRead = Authenticator(
    required_scopes={
        Scope.web_read,
        Scope.web_write,
        Scope.products_read,
        Scope.products_write,
    },
    allowed_subjects={User, Organization},
)
CommunityCreatorRead = Annotated[
    AuthSubject[User | Organization], Depends(_CommunityCreatorRead)
]


# ----------------------------------------------------------------------
# Customer (enrolled student) side — same shape as
# customer_portal.auth.CustomerPortalUnionRead. We don't redeclare the
# Authenticator instance so any future change to the customer portal's
# session-token semantics flows through one place.
# ----------------------------------------------------------------------
_CommunityCustomerRead = Authenticator(
    required_scopes={
        Scope.customer_portal_read,
        Scope.customer_portal_write,
    },
    allowed_subjects={Customer, Member},
)
CommunityCustomerRead = Annotated[
    AuthSubject[Customer | Member], Depends(_CommunityCustomerRead)
]

_CommunityCustomerWrite = Authenticator(
    required_scopes={Scope.customer_portal_write},
    allowed_subjects={Customer, Member},
)
CommunityCustomerWrite = Annotated[
    AuthSubject[Customer | Member], Depends(_CommunityCustomerWrite)
]

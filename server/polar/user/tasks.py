import uuid

from polar.exceptions import PolarTaskError
from polar.worker import AsyncSessionMaker, TaskPriority, actor

from .repository import UserRepository


class UserTaskError(PolarTaskError): ...


class UserDoesNotExist(UserTaskError):
    def __init__(self, user_id: uuid.UUID) -> None:
        self.user_id = user_id
        message = f"The user with id {user_id} does not exist."
        super().__init__(message)


@actor(actor_name="user.on_after_signup", priority=TaskPriority.LOW)
async def user_on_after_signup(user_id: uuid.UUID) -> None:
    # The founder welcome email is keyed to "starting your trial" — which is
    # not yet true at account signup (the 14-day trial begins when the creator
    # picks a plan in onboarding). It now fires there, at plan-trial-start,
    # from the order-confirmation path, so there is nothing to send at signup.
    #
    # The actor is kept (a no-op beyond verifying the user) so the existing
    # signup enqueue sites — email, Apple, Google, GitHub — stay valid without
    # touching those auth paths. Previously this rendered `user_welcome`, but
    # that template was never registered in the email renderer, so the send
    # errored and the welcome never went out at all.
    async with AsyncSessionMaker() as session:
        repository = UserRepository.from_session(session)
        user = await repository.get_by_id(user_id)
        if user is None:
            raise UserDoesNotExist(user_id)

"""The server's sentences, one part of `en.py` and `fr.py` (`say`): signing
in, the account, billing and the pages the browser shows on the way."""

EN: dict[str, str] = {
    # The app's email sign-in (`email_sign_in.py`) and the web's password form.
    "sign_in.wrong_code": "That code is wrong or has expired. Check the email, or send a new one.",
    "sign_in.wrong_password": "Wrong email or password. If you've never set a password, use the code we email you.",
    "sign_in.too_many_codes": "Too many codes asked for this email. Try again in a few minutes.",
    "sign_in.too_many_tries": "Too many tries for this email. Try again in a few minutes.",
    "sign_in.closed": "This account can't sign in to Simeon.",
    "sign_in.bad_email": "Enter a valid email address.",
    # A password the account can't take (`passwords.password_problem`).
    "password.too_short": "Use at least {count} characters.",
    "password.too_long": "Use {count} characters or fewer.",
    "password.is_email": "Choose a password that isn't your email.",
    # Apple's and Google's native sign-ins (`app_sign_in.py`).
    "sign_in.google_unfinished": "Google sign-in didn't finish.",
    "sign_in.apple_unfinished": "Sign in with Apple didn't finish.",
    # The sign-in pages the browser shows (`app_sign_in._page`).
    "sign_in.page.incomplete": "That link is incomplete",
    "sign_in.page.sign_in_there": "Open {product} and sign in from there.",
    "sign_in.page.apple_soon": "Sign in with Apple is coming soon",
    "sign_in.page.google_for_now": "For now, continue with Google.",
    "sign_in.page.continue_with_google": "Continue with Google",
    "sign_in.page.signed_in": "You're signed in to {product}",
    "sign_in.page.plan_on": "Your plan is on. You can close this tab and go back to {product}.",
    "sign_in.page.close_tab": "You can close this tab and go back to {product}.",
    "sign_in.page.title": "Sign in to {product}",
    "sign_in.page.continue_as": "Continue as {email}",
    "sign_in.page.other_account": "Use a different account",
    "sign_in.page.failed": "That sign-in could not be completed",
    "sign_in.page.try_again": "Open {product} and try again.",
    "sign_in.page.legal": "By continuing, you agree to our {terms} & {privacy}.",
    "sign_in.page.terms": "Terms",
    "sign_in.page.privacy": "Privacy Policy",
    # The last page of an app's sign-in in a browser tab (`apps.py`).
    "apps.page.connected": "Connected",
    "apps.page.failed": "That didn't work",
    "apps.page.close_tab": "You can close this tab and go back to Simeon.",
    "apps.page.try_again": "Go back to Simeon and try again.",
    "apps.page.expired": "That link has expired",
    "apps.page.broken": "That link didn't work",
    # Settings › Account (`endpoints.py`, `service.py`).
    "profile.not_a_language": "That is not a language.",
    "profile.name_length": "A name of 1 to 60 characters.",
    "feedback.empty": "Feedback needs a message.",
    # Deleting the account (`account_deletion.py`): `{why}` is one of the
    # sentences after it.
    "account.delete.try_again": "{why} Try again in a few minutes.",
    "account.delete.billing_unreachable": "Billing can't be reached right now.",
    "account.delete.subscription_not_ended": "Your subscription couldn't be ended right now.",
    "account.delete.computer_unreachable": "Your agents' computer couldn't be reached right now.",
    "account.delete.computer_not_deleted": "Your agents' computer couldn't be deleted right now.",
    "account.delete.computer_starting": "Your agents' computer is starting.",
    # Plans and billing (`simeon/plans`).
    "billing.unknown_plan": "That plan is not one of ours.",
    "billing.not_configured": "Billing is not configured on this server.",
    "billing.already_subscribed": "You already have a plan. Change or cancel it from the billing page.",
    "billing.manage_on_iphone": (
        "Your plan is billed through Apple. Change or cancel it on your iPhone in "
        "Settings › your name › Subscriptions."
    ),
    "billing.no_subscription": "You have no plan to manage yet.",
    "billing.bad_return_url": "That return address is not one of ours.",
    "billing.checkout_not_yours": "That checkout belongs to another account.",
    "app_store.unverified": "Apple's receipt for this purchase couldn't be checked.",
    "app_store.not_configured": (
        "Purchases in the app aren't set up on Simeon's server yet. Try again later."
    ),
    "app_store.not_your_purchase": (
        "This purchase belongs to another Simeon account. Sign in with that "
        "account, or use a different Apple ID."
    ),
}

FR: dict[str, str] = {
    "sign_in.wrong_code": "Ce code est faux ou a expiré. Vérifie l’e-mail, ou demandes-en un nouveau.",
    "sign_in.wrong_password": "E-mail ou mot de passe incorrect. Si tu n’as jamais choisi de mot de passe, utilise le code qu’on t’envoie par e-mail.",
    "sign_in.too_many_codes": "Trop de codes demandés pour cet e-mail. Réessaie dans quelques minutes.",
    "sign_in.too_many_tries": "Trop de tentatives pour cet e-mail. Réessaie dans quelques minutes.",
    "sign_in.closed": "Ce compte ne peut pas se connecter à Simeon.",
    "sign_in.bad_email": "Saisis une adresse e-mail valide.",
    "password.too_short": "Utilise au moins {count} caractères.",
    "password.too_long": "Utilise {count} caractères au maximum.",
    "password.is_email": "Choisis un mot de passe différent de ton e-mail.",
    "sign_in.google_unfinished": "La connexion avec Google n’a pas abouti.",
    "sign_in.apple_unfinished": "La connexion avec Apple n’a pas abouti.",
    "sign_in.page.incomplete": "Ce lien est incomplet",
    "sign_in.page.sign_in_there": "Ouvre {product} et connecte-toi depuis l’app.",
    "sign_in.page.apple_soon": "La connexion avec Apple arrive bientôt",
    "sign_in.page.google_for_now": "En attendant, continue avec Google.",
    "sign_in.page.continue_with_google": "Continuer avec Google",
    "sign_in.page.signed_in": "Connexion à {product} réussie",
    "sign_in.page.plan_on": "Ton forfait est actif. Tu peux fermer cet onglet et revenir sur {product}.",
    "sign_in.page.close_tab": "Tu peux fermer cet onglet et revenir sur {product}.",
    "sign_in.page.title": "Se connecter à {product}",
    "sign_in.page.continue_as": "Continuer en tant que {email}",
    "sign_in.page.other_account": "Utiliser un autre compte",
    "sign_in.page.failed": "Cette connexion n’a pas pu aboutir",
    "sign_in.page.try_again": "Ouvre {product} et réessaie.",
    "sign_in.page.legal": "En continuant, tu acceptes nos {terms} et notre {privacy}.",
    "sign_in.page.terms": "Conditions",
    "sign_in.page.privacy": "Politique de confidentialité",
    "apps.page.connected": "Connecté",
    "apps.page.failed": "Ça n’a pas marché",
    "apps.page.close_tab": "Tu peux fermer cet onglet et revenir sur Simeon.",
    "apps.page.try_again": "Retourne sur Simeon et réessaie.",
    "apps.page.expired": "Ce lien a expiré",
    "apps.page.broken": "Ce lien n’a pas marché",
    "profile.not_a_language": "Ce n’est pas une langue.",
    "profile.name_length": "Un nom de 1 à 60 caractères.",
    "feedback.empty": "Écris un message pour envoyer ton retour.",
    "account.delete.try_again": "{why} Réessaie dans quelques minutes.",
    "account.delete.billing_unreachable": "La facturation est injoignable pour le moment.",
    "account.delete.subscription_not_ended": "Ton abonnement n’a pas pu être arrêté pour le moment.",
    "account.delete.computer_unreachable": "L’ordinateur de tes agents est injoignable pour le moment.",
    "account.delete.computer_not_deleted": "L’ordinateur de tes agents n’a pas pu être supprimé pour le moment.",
    "account.delete.computer_starting": "L’ordinateur de tes agents est en train de démarrer.",
    "billing.unknown_plan": "Ce forfait n’existe pas chez nous.",
    "billing.not_configured": "La facturation n’est pas configurée sur ce serveur.",
    "billing.already_subscribed": "Tu as déjà un forfait. Change-le ou résilie-le depuis la page de facturation.",
    "billing.manage_on_iphone": (
        "Ton forfait est facturé par Apple. Change-le ou résilie-le sur ton iPhone "
        "dans Réglages › ton nom › Abonnements."
    ),
    "billing.no_subscription": "Tu n’as pas encore de forfait à gérer.",
    "billing.bad_return_url": "Cette adresse de retour n’est pas l’une des nôtres.",
    "billing.checkout_not_yours": "Ce paiement appartient à un autre compte.",
    "app_store.unverified": "Le reçu d’Apple pour cet achat n’a pas pu être vérifié.",
    "app_store.not_configured": (
        "Les achats dans l’app ne sont pas encore configurés sur le serveur de "
        "Simeon. Réessaie plus tard."
    ),
    "app_store.not_your_purchase": (
        "Cet achat appartient à un autre compte Simeon. Connecte-toi avec ce "
        "compte, ou utilise un autre identifiant Apple."
    ),
}

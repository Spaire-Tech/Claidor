"""The server's sentences, one part of each language's table (`say`): the
Secure Credentials Store (`credentials.py`)."""

EN: dict[str, str] = {
    "credentials.kind": "Say whether it's a login or contact info.",
    "credentials.too_long": "Something in it is too long to keep.",
    "credentials.website": "That website isn't an address. Write it like acme.com.",
    "credentials.login_needs_site": "A login needs its website or a name.",
    "credentials.login_needs_sign_in": "A login needs its username or its password.",
    "credentials.contact_empty": "Contact info needs at least one detail.",
    "credentials.not_found": "That entry isn't in your Secure Credentials Store anymore.",
    "credentials.full": "Your Secure Credentials Store is full. Delete what you no longer use first.",
}

FR: dict[str, str] = {
    "credentials.kind": "Précise s’il s’agit d’un identifiant ou de coordonnées.",
    "credentials.too_long": "Un des champs est trop long pour être enregistré.",
    "credentials.website": "Ce site n’est pas une adresse. Écris-le comme acme.com.",
    "credentials.login_needs_site": "Un identifiant a besoin de son site ou d’un nom.",
    "credentials.login_needs_sign_in": "Un identifiant a besoin de son nom d’utilisateur ou de son mot de passe.",
    "credentials.contact_empty": "Les coordonnées ont besoin d’au moins un détail.",
    "credentials.not_found": "Cette entrée n’est plus dans ton coffre-fort des identifiants.",
    "credentials.full": "Ton coffre-fort des identifiants est plein. Supprime d’abord ce que tu n’utilises plus.",
}

ES: dict[str, str] = {
    "credentials.kind": "Indica si es un inicio de sesión o datos de contacto.",
    "credentials.too_long": "Algo es demasiado largo para guardarlo.",
    "credentials.website": "Ese sitio web no es una dirección. Escríbelo como acme.com.",
    "credentials.login_needs_site": "Un inicio de sesión necesita su sitio web o un nombre.",
    "credentials.login_needs_sign_in": "Un inicio de sesión necesita su usuario o su contraseña.",
    "credentials.contact_empty": "Los datos de contacto necesitan al menos un dato.",
    "credentials.not_found": "Esa entrada ya no está en tu almacén seguro de credenciales.",
    "credentials.full": "Tu almacén seguro de credenciales está lleno. Primero borra lo que ya no uses.",
}

DE: dict[str, str] = {
    "credentials.kind": "Gib an, ob es ein Login oder Kontaktdaten sind.",
    "credentials.too_long": "Etwas darin ist zu lang zum Speichern.",
    "credentials.website": "Diese Website ist keine Adresse. Schreib sie wie acme.com.",
    "credentials.login_needs_site": "Ein Login braucht seine Website oder einen Namen.",
    "credentials.login_needs_sign_in": "Ein Login braucht seinen Benutzernamen oder sein Passwort.",
    "credentials.contact_empty": "Kontaktdaten brauchen mindestens eine Angabe.",
    "credentials.not_found": "Dieser Eintrag ist nicht mehr in deinem sicheren Anmeldedaten-Speicher.",
    "credentials.full": "Dein sicherer Anmeldedaten-Speicher ist voll. Lösch zuerst, was du nicht mehr brauchst.",
}

NL: dict[str, str] = {
    "credentials.kind": "Geef aan of het een login of contactgegevens is.",
    "credentials.too_long": "Iets erin is te lang om te bewaren.",
    "credentials.website": "Die website is geen adres. Schrijf het zoals acme.com.",
    "credentials.login_needs_site": "Een login heeft een website of een naam nodig.",
    "credentials.login_needs_sign_in": "Een login heeft een gebruikersnaam of wachtwoord nodig.",
    "credentials.contact_empty": "Contactgegevens hebben minstens één gegeven nodig.",
    "credentials.not_found": "Dat item staat niet meer in je veilige opslag voor inloggegevens.",
    "credentials.full": "Je veilige opslag voor inloggegevens is vol. Verwijder eerst wat je niet meer gebruikt.",
}

IT: dict[str, str] = {
    "credentials.kind": "Indica se è un accesso o dei dati di contatto.",
    "credentials.too_long": "Qualcosa è troppo lungo per essere salvato.",
    "credentials.website": "Quel sito non è un indirizzo. Scrivilo come acme.com.",
    "credentials.login_needs_site": "Un accesso ha bisogno del suo sito o di un nome.",
    "credentials.login_needs_sign_in": "Un accesso ha bisogno del nome utente o della password.",
    "credentials.contact_empty": "I dati di contatto hanno bisogno di almeno un dettaglio.",
    "credentials.not_found": "Quella voce non è più nel tuo archivio sicuro delle credenziali.",
    "credentials.full": "Il tuo archivio sicuro delle credenziali è pieno. Prima elimina ciò che non usi più.",
}

PT_BR: dict[str, str] = {
    "credentials.kind": "Diga se é um login ou dados de contato.",
    "credentials.too_long": "Algo nele é longo demais para guardar.",
    "credentials.website": "Esse site não é um endereço. Escreva como acme.com.",
    "credentials.login_needs_site": "Um login precisa do site ou de um nome.",
    "credentials.login_needs_sign_in": "Um login precisa do nome de usuário ou da senha.",
    "credentials.contact_empty": "Os dados de contato precisam de pelo menos uma informação.",
    "credentials.not_found": "Esse item não está mais no seu cofre seguro de credenciais.",
    "credentials.full": "Seu cofre seguro de credenciais está cheio. Apague primeiro o que você não usa mais.",
}

SV: dict[str, str] = {
    "credentials.kind": "Säg om det är en inloggning eller kontaktuppgifter.",
    "credentials.too_long": "Något i den är för långt för att sparas.",
    "credentials.website": "Den webbplatsen är ingen adress. Skriv den som acme.com.",
    "credentials.login_needs_site": "En inloggning behöver sin webbplats eller ett namn.",
    "credentials.login_needs_sign_in": "En inloggning behöver sitt användarnamn eller sitt lösenord.",
    "credentials.contact_empty": "Kontaktuppgifter behöver minst en uppgift.",
    "credentials.not_found": "Den posten finns inte längre i din säkra lagring av inloggningsuppgifter.",
    "credentials.full": "Din säkra lagring av inloggningsuppgifter är full. Radera först det du inte längre använder.",
}

PL: dict[str, str] = {
    "credentials.kind": "Powiedz, czy to dane logowania, czy dane kontaktowe.",
    "credentials.too_long": "Coś w nim jest za długie, by to zapisać.",
    "credentials.website": "Ta strona nie jest adresem. Wpisz ją jak acme.com.",
    "credentials.login_needs_site": "Dane logowania potrzebują strony albo nazwy.",
    "credentials.login_needs_sign_in": "Dane logowania potrzebują nazwy użytkownika albo hasła.",
    "credentials.contact_empty": "Dane kontaktowe potrzebują co najmniej jednej informacji.",
    "credentials.not_found": "Tego wpisu nie ma już w twoim bezpiecznym magazynie danych logowania.",
    "credentials.full": "Twój bezpieczny magazyn danych logowania jest pełny. Najpierw usuń to, czego już nie używasz.",
}

TR: dict[str, str] = {
    "credentials.kind": "Bunun bir giriş mi yoksa iletişim bilgisi mi olduğunu söyle.",
    "credentials.too_long": "İçindeki bir şey kaydedilemeyecek kadar uzun.",
    "credentials.website": "O web sitesi bir adres değil. acme.com gibi yaz.",
    "credentials.login_needs_site": "Bir girişin web sitesine ya da bir ada ihtiyacı var.",
    "credentials.login_needs_sign_in": "Bir girişin kullanıcı adına ya da parolasına ihtiyacı var.",
    "credentials.contact_empty": "İletişim bilgisinin en az bir ayrıntıya ihtiyacı var.",
    "credentials.not_found": "O kayıt artık Güvenli Kimlik Bilgisi Deposu’nda değil.",
    "credentials.full": "Güvenli Kimlik Bilgisi Deposu dolu. Önce artık kullanmadıklarını sil.",
}

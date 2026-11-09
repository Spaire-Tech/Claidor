"""The server's sentences, one part of each language's table (`say`): the
Credentials Store (`credentials.py`)."""

EN: dict[str, str] = {
    "credentials.kind": "Say whether it's a login, contact info or a card.",
    "credentials.too_long": "Something in it is too long to keep.",
    "credentials.website": "That website isn't an address. Write it like acme.com.",
    "credentials.login_needs_site": "A login needs its website or a name.",
    "credentials.login_needs_sign_in": "A login needs its username or its password.",
    "credentials.contact_empty": "Contact info needs at least one detail.",
    "credentials.not_found": "That entry isn't in your Credentials Store anymore.",
    "credentials.full": "Your Credentials Store is full. Delete what you no longer use first.",
    "credentials.card_number": "That card number isn't right. Check it and try again.",
    "credentials.card_expiry": "Write the expiry like 08/28.",
    "credentials.card_code": "The security code is the 3 or 4 digits on the card.",
    "credentials.card_billing": "That billing address isn't in your Credentials Store anymore.",
    "credentials.card_by_person": "Only you can add a card, in Settings.",
}

FR: dict[str, str] = {
    "credentials.kind": "Précise s’il s’agit d’un identifiant, de coordonnées ou d’une carte.",
    "credentials.too_long": "Un des champs est trop long pour être enregistré.",
    "credentials.website": "Ce site n’est pas une adresse. Écris-le comme acme.com.",
    "credentials.login_needs_site": "Un identifiant a besoin de son site ou d’un nom.",
    "credentials.login_needs_sign_in": "Un identifiant a besoin de son nom d’utilisateur ou de son mot de passe.",
    "credentials.contact_empty": "Les coordonnées ont besoin d’au moins un détail.",
    "credentials.not_found": "Cette entrée n’est plus dans ton coffre d’identifiants.",
    "credentials.full": "Ton coffre d’identifiants est plein. Supprime d’abord ce que tu n’utilises plus.",
    "credentials.card_number": "Ce numéro de carte n’est pas correct. Vérifie-le et réessaie.",
    "credentials.card_expiry": "Écris la date d’expiration comme 08/28.",
    "credentials.card_code": "Le code de sécurité, ce sont les 3 ou 4 chiffres sur la carte.",
    "credentials.card_billing": "Cette adresse de facturation n’est plus dans ton coffre d’identifiants.",
    "credentials.card_by_person": "Toi seul peux ajouter une carte, dans les Réglages.",
}

ES: dict[str, str] = {
    "credentials.kind": "Indica si es un inicio de sesión, datos de contacto o una tarjeta.",
    "credentials.too_long": "Algo es demasiado largo para guardarlo.",
    "credentials.website": "Ese sitio web no es una dirección. Escríbelo como acme.com.",
    "credentials.login_needs_site": "Un inicio de sesión necesita su sitio web o un nombre.",
    "credentials.login_needs_sign_in": "Un inicio de sesión necesita su usuario o su contraseña.",
    "credentials.contact_empty": "Los datos de contacto necesitan al menos un dato.",
    "credentials.not_found": "Esa entrada ya no está en tus credenciales.",
    "credentials.full": "Alcanzaste el máximo de credenciales. Primero borra lo que ya no uses.",
    "credentials.card_number": "Ese número de tarjeta no es correcto. Revísalo y vuelve a intentarlo.",
    "credentials.card_expiry": "Escribe la fecha de vencimiento como 08/28.",
    "credentials.card_code": "El código de seguridad son los 3 o 4 dígitos de la tarjeta.",
    "credentials.card_billing": "Esa dirección de facturación ya no está en tus credenciales.",
    "credentials.card_by_person": "Solo tú puedes agregar una tarjeta, en Ajustes.",
}

DE: dict[str, str] = {
    "credentials.kind": "Gib an, ob es ein Login, Kontaktdaten oder eine Karte sind.",
    "credentials.too_long": "Etwas darin ist zu lang zum Speichern.",
    "credentials.website": "Diese Website ist keine Adresse. Schreib sie wie acme.com.",
    "credentials.login_needs_site": "Ein Login braucht seine Website oder einen Namen.",
    "credentials.login_needs_sign_in": "Ein Login braucht seinen Benutzernamen oder sein Passwort.",
    "credentials.contact_empty": "Kontaktdaten brauchen mindestens eine Angabe.",
    "credentials.not_found": "Dieser Eintrag ist nicht mehr in deinen Zugangsdaten.",
    "credentials.full": "Du hast die Höchstzahl an Zugangsdaten erreicht. Lösch zuerst, was du nicht mehr brauchst.",
    "credentials.card_number": "Diese Kartennummer stimmt nicht. Prüf sie und versuch es noch mal.",
    "credentials.card_expiry": "Schreib das Ablaufdatum wie 08/28.",
    "credentials.card_code": "Der Sicherheitscode sind die 3 oder 4 Ziffern auf der Karte.",
    "credentials.card_billing": "Diese Rechnungsadresse ist nicht mehr in deinen Zugangsdaten.",
    "credentials.card_by_person": "Nur du kannst eine Karte hinzufügen, in den Einstellungen.",
}

NL: dict[str, str] = {
    "credentials.kind": "Geef aan of het een login, contactgegevens of een kaart is.",
    "credentials.too_long": "Iets erin is te lang om te bewaren.",
    "credentials.website": "Die website is geen adres. Schrijf het zoals acme.com.",
    "credentials.login_needs_site": "Een login heeft een website of een naam nodig.",
    "credentials.login_needs_sign_in": "Een login heeft een gebruikersnaam of wachtwoord nodig.",
    "credentials.contact_empty": "Contactgegevens hebben minstens één gegeven nodig.",
    "credentials.not_found": "Dat item staat niet meer in je inloggegevens.",
    "credentials.full": "Je hebt het maximum aantal inloggegevens bereikt. Verwijder eerst wat je niet meer gebruikt.",
    "credentials.card_number": "Dat kaartnummer klopt niet. Controleer het en probeer het opnieuw.",
    "credentials.card_expiry": "Schrijf de vervaldatum zoals 08/28.",
    "credentials.card_code": "De beveiligingscode is de 3 of 4 cijfers op de kaart.",
    "credentials.card_billing": "Dat factuuradres staat niet meer in je inloggegevens.",
    "credentials.card_by_person": "Alleen jij kunt een kaart toevoegen, in Instellingen.",
}

IT: dict[str, str] = {
    "credentials.kind": "Indica se è un accesso, dei dati di contatto o una carta.",
    "credentials.too_long": "Qualcosa è troppo lungo per essere salvato.",
    "credentials.website": "Quel sito non è un indirizzo. Scrivilo come acme.com.",
    "credentials.login_needs_site": "Un accesso ha bisogno del suo sito o di un nome.",
    "credentials.login_needs_sign_in": "Un accesso ha bisogno del nome utente o della password.",
    "credentials.contact_empty": "I dati di contatto hanno bisogno di almeno un dettaglio.",
    "credentials.not_found": "Quella voce non è più nelle tue credenziali.",
    "credentials.full": "Hai raggiunto il numero massimo di credenziali. Prima elimina ciò che non usi più.",
    "credentials.card_number": "Quel numero di carta non è corretto. Controllalo e riprova.",
    "credentials.card_expiry": "Scrivi la scadenza come 08/28.",
    "credentials.card_code": "Il codice di sicurezza sono le 3 o 4 cifre sulla carta.",
    "credentials.card_billing": "Quell’indirizzo di fatturazione non è più nelle tue credenziali.",
    "credentials.card_by_person": "Solo tu puoi aggiungere una carta, nelle Impostazioni.",
}

PT_BR: dict[str, str] = {
    "credentials.kind": "Diga se é um login, dados de contato ou um cartão.",
    "credentials.too_long": "Algo nele é longo demais para guardar.",
    "credentials.website": "Esse site não é um endereço. Escreva como acme.com.",
    "credentials.login_needs_site": "Um login precisa do site ou de um nome.",
    "credentials.login_needs_sign_in": "Um login precisa do nome de usuário ou da senha.",
    "credentials.contact_empty": "Os dados de contato precisam de pelo menos uma informação.",
    "credentials.not_found": "Esse item não está mais nas suas credenciais.",
    "credentials.full": "Você atingiu o número máximo de credenciais. Apague primeiro o que não usa mais.",
    "credentials.card_number": "Esse número de cartão não está certo. Confira e tente de novo.",
    "credentials.card_expiry": "Escreva a validade como 08/28.",
    "credentials.card_code": "O código de segurança são os 3 ou 4 dígitos do cartão.",
    "credentials.card_billing": "Esse endereço de cobrança não está mais nas suas credenciais.",
    "credentials.card_by_person": "Só você pode adicionar um cartão, em Ajustes.",
}

SV: dict[str, str] = {
    "credentials.kind": "Ange om det är en inloggning, kontaktuppgifter eller ett kort.",
    "credentials.too_long": "Något i den är för långt för att sparas.",
    "credentials.website": "Den webbplatsen är ingen adress. Skriv den som acme.com.",
    "credentials.login_needs_site": "En inloggning behöver sin webbplats eller ett namn.",
    "credentials.login_needs_sign_in": "En inloggning behöver sitt användarnamn eller sitt lösenord.",
    "credentials.contact_empty": "Kontaktuppgifter behöver minst en uppgift.",
    "credentials.not_found": "Den posten finns inte längre bland dina inloggningsuppgifter.",
    "credentials.full": "Du har nått maxantalet inloggningsuppgifter. Radera först det du inte längre använder.",
    "credentials.card_number": "Kortnumret stämmer inte. Kontrollera det och försök igen.",
    "credentials.card_expiry": "Skriv utgångsdatumet som 08/28.",
    "credentials.card_code": "Säkerhetskoden är de 3 eller 4 siffrorna på kortet.",
    "credentials.card_billing": "Den faktureringsadressen finns inte längre bland dina inloggningsuppgifter.",
    "credentials.card_by_person": "Bara du kan lägga till ett kort, i Inställningar.",
}

PL: dict[str, str] = {
    "credentials.kind": "Określ, czy to dane logowania, dane kontaktowe czy karta.",
    "credentials.too_long": "Coś w nim jest za długie, by to zapisać.",
    "credentials.website": "Ta strona nie jest adresem. Wpisz ją jak acme.com.",
    "credentials.login_needs_site": "Dane logowania potrzebują strony albo nazwy.",
    "credentials.login_needs_sign_in": "Dane logowania potrzebują nazwy użytkownika albo hasła.",
    "credentials.contact_empty": "Dane kontaktowe potrzebują co najmniej jednej informacji.",
    "credentials.not_found": "Tego wpisu nie ma już w twoich danych logowania.",
    "credentials.full": "Osiągnięto limit danych logowania. Najpierw usuń to, czego już nie używasz.",
    "credentials.card_number": "Ten numer karty jest nieprawidłowy. Sprawdź go i spróbuj ponownie.",
    "credentials.card_expiry": "Wpisz datę ważności jak 08/28.",
    "credentials.card_code": "Kod bezpieczeństwa to 3 lub 4 cyfry na karcie.",
    "credentials.card_billing": "Tego adresu rozliczeniowego nie ma już w twoich danych logowania.",
    "credentials.card_by_person": "Tylko ty możesz dodać kartę, w Ustawieniach.",
}

TR: dict[str, str] = {
    "credentials.kind": "Bunun bir giriş bilgisi, iletişim bilgisi mi yoksa bir kart mı olduğunu belirt.",
    "credentials.too_long": "İçindeki bir şey kaydedilemeyecek kadar uzun.",
    "credentials.website": "O web sitesi bir adres değil. acme.com gibi yaz.",
    "credentials.login_needs_site": "Bir girişin web sitesine ya da bir ada ihtiyacı var.",
    "credentials.login_needs_sign_in": "Bir girişin kullanıcı adına ya da parolasına ihtiyacı var.",
    "credentials.contact_empty": "İletişim bilgisinin en az bir ayrıntıya ihtiyacı var.",
    "credentials.not_found": "O kayıt artık Kimlik Bilgileri’nde değil.",
    "credentials.full": "Kimlik Bilgileri dolu. Önce artık kullanmadıklarını sil.",
    "credentials.card_number": "Bu kart numarası doğru değil. Kontrol edip tekrar dene.",
    "credentials.card_expiry": "Son kullanma tarihini 08/28 gibi yaz.",
    "credentials.card_code": "Güvenlik kodu, karttaki 3 veya 4 hanedir.",
    "credentials.card_billing": "Bu fatura adresi artık kimlik bilgilerinde değil.",
    "credentials.card_by_person": "Kartı yalnızca sen, Ayarlar’dan ekleyebilirsin.",
}

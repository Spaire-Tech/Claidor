"""Builds the website's Contact page (/contact).

The founder, 24 October 2026, after ElevenLabs' "Book a personalized demo":
"can we get a real contact us page. and under the hood for it to send any
inquiry to bass@simeonlabs ... maybe just a simple page, without the divider".
On the left, the headline, a line and three things a message gets you; on the
right, the form: first and last name, e-mail, company website, country and the
message. Every "Request a demo" on the site and the footers' Contact open it.

The form posts to the API (`POST https://api.simeonlabs.com/desktop/api/contact`,
server/simeon/desktop/contact.py), which e-mails the message to the founder
with the person as the reply-to; the page then thanks the person by name. A
hidden field (`address`) catches the bots that fill every field.

It rewrites public/contact/ from scratch; build.py calls it after pricing.py,
and it runs alone too, needing nothing but Python:

    python3 contact.py
"""
import os, shutil

import teams
from teams import frame
from versioning import version_style

OUT = teams.OUT
API = "https://api.simeonlabs.com"
# Where a message goes when the form cannot reach the API (the founder's address, as on the server).
INBOX = "bass@simeonlabs.com"

# Three things a message gets you, each true of how Simeon answers (no ratings or awards to show yet).
POINTS = [
    ('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
     "A demo of Simeon on the work you do"),
    ('<path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
     "Answers on plans, security and your data"),
    ('<path d="M4.5 6.5h15v10h-9l-4 3.5v-3.5h-2z"/>',
     "Read by a person, answered by e-mail"),
]

CONTACT_CSS = """
/* Contact: the headline and three lines on the left, the form on the right, on the white page; one column on a
   phone. The fields are Connectors' search's border and focus, squared to 12 as a form's. */
.contact{padding:clamp(40px,8.1*var(--vw,1vw),162px) 0 clamp(88px,7*var(--vw,1vw),140px)}
.contact .wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,640px);gap:clamp(40px,6*var(--vw,1vw),120px);align-items:start}
.contact h1{max-width:var(--title-max);font-size:var(--t-display);line-height:1.1;font-weight:var(--w-display);letter-spacing:-.025em;text-wrap:pretty}
.contact .lead{max-width:30em;margin-top:clamp(14px,1.2*var(--vw,1vw),22px);font-size:var(--t-lead);line-height:1.45;color:var(--ink2)}
.points{display:flex;flex-direction:column;gap:14px;margin:clamp(28px,2.6*var(--vw,1vw),44px) 0 0;padding:0;list-style:none;font-size:var(--t-body)}
.points li{display:flex;align-items:center;gap:12px}
.points svg{flex:none;width:22px;height:22px;fill:none;stroke:var(--ink);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.form{display:grid;grid-template-columns:1fr 1fr;gap:20px 16px}
.field{display:flex;flex-direction:column;gap:8px;min-width:0}
.field.wide{grid-column:1/-1}
.field label{font-size:var(--t-body);letter-spacing:-.01em}
.field label small{margin-left:6px;font-size:var(--t-small);color:#86868b}
.field input,.field select,.field textarea{display:block;width:100%;height:48px;padding:0 16px;border:1px solid #e3e3e8;border-radius:12px;background:#fff;color:var(--ink);font:inherit;font-size:var(--t-field);letter-spacing:-.01em;outline:none;-webkit-appearance:none;appearance:none;transition:border-color .2s,box-shadow .2s}
.field textarea{height:auto;min-height:150px;padding:12px 16px;line-height:1.45;resize:vertical}
.field select{padding-right:44px;cursor:pointer;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231d1d1f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") right 16px center/16px no-repeat}
.field input:focus,.field select:focus,.field textarea:focus{border-color:#c7c7cc;box-shadow:0 4px 14px rgba(0,0,0,.05)} /* no blue ring */
.field input::placeholder,.field textarea::placeholder{color:#86868b;opacity:1}
.trap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden} /* the field only a bot fills */
.form .send{grid-column:1/-1;width:100%;height:48px;margin-top:8px;border:0;font:inherit;font-size:var(--t-field);cursor:pointer}
.form .send:disabled{opacity:.5;cursor:default}
.form .note{grid-column:1/-1;font-size:var(--t-small);line-height:1.5;color:#86868b}
.form .note a{color:inherit}
.form .error{grid-column:1/-1;font-size:var(--t-body);color:#c4362c}
.form .error a{color:inherit}
.thanks h2{font-size:var(--t-title);line-height:1.2;font-weight:var(--w-display);letter-spacing:-.02em}
.thanks p{margin-top:12px;font-size:var(--t-lead);line-height:1.45;color:var(--ink2)}
.thanks[hidden],.form[hidden],.error[hidden]{display:none}
@media (max-width:860px){.contact .wrap{grid-template-columns:1fr}}
@media (max-width:734px){.contact{padding-top:88px}.contact h1{max-width:13em;text-wrap:balance}.form{grid-template-columns:1fr}}
"""

# Every country by its ISO code, named by the browser (Intl.DisplayNames), the one of the person's language
# chosen first; the uninhabited territories left out.
COUNTRIES = ("AF AX AL DZ AS AD AO AI AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BR IO BN BG BF BI "
             "CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK "
             "FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT VA HN HK HU IS IN ID IR IQ IE IM IL IT "
             "JM JP JE JO KZ KE KI XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN "
             "ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF KP MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO "
             "RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA KR SS ES LK SD SR SJ SE CH SY TW TJ "
             "TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UY UZ VU VE VN VG VI WF EH YE ZM ZW")

CONTACT_JS = """<script>
// The countries, named by the browser, the person's own chosen first; then the form, posted to the API,
// which e-mails the message on (server/simeon/desktop/contact.py). Thanks by name once it is sent.
(() => {
  const form = document.querySelector('.form'), select = form.elements.country;
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    const list = '%COUNTRIES%'.split(' ').map((code) => [code, names.of(code)]).sort((a, b) => a[1].localeCompare(b[1]));
    let mine = '';
    try { mine = new Intl.Locale(navigator.language).maximize().region || ''; } catch (e) {}
    for (const [code, name] of list) {
      const option = new Option(name, name);
      if (code === mine) option.selected = true;
      select.add(option);
    }
  } catch (e) {}
  const button = form.querySelector('.send'), error = form.querySelector('.error'), thanks = document.querySelector('.thanks');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    button.disabled = true; error.hidden = true;
    try {
      const answer = await fetch('%API%/desktop/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (!answer.ok) throw new Error(String(answer.status));
      thanks.querySelector('h2').textContent = 'Thanks, ' + data.firstName.trim() + '.';
      thanks.querySelector('.to').textContent = data.email.trim();
      form.hidden = true; thanks.hidden = false; thanks.focus();
    } catch (e) {
      error.hidden = false; button.disabled = false;
    }
  });
})();
</script>"""


def page():
    points = "".join(f'<li><svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>{words}</li>' for icon, words in POINTS)
    body = f"""<section class="contact" aria-label="Contact">
  <div class="wrap">
    <div class="intro">
      <h1>Contact us</h1>
      <p class="lead">Book a demo, ask about plans, or tell us what you need. We will reply by e-mail.</p>
      <ul class="points">{points}</ul>
    </div>
    <div>
      <form class="form" novalidate>
        <div class="field"><label for="first">First name</label><input id="first" name="firstName" autocomplete="given-name" required maxlength="100"></div>
        <div class="field"><label for="last">Last name</label><input id="last" name="lastName" autocomplete="family-name" required maxlength="100"></div>
        <div class="field wide"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" required maxlength="254"></div>
        <div class="field wide"><label for="website">Company website<small>Optional</small></label><input id="website" name="website" type="text" inputmode="url" autocomplete="url" placeholder="example.com" maxlength="300"></div>
        <div class="field wide"><label for="country">Country<small>Optional</small></label><select id="country" name="country"><option value="">Choose a country</option></select></div>
        <div class="field wide"><label for="message">How can we help?</label><textarea id="message" name="message" required maxlength="5000" placeholder="A demo for my team, a question about plans, anything else"></textarea></div>
        <div class="trap" aria-hidden="true"><label for="address">Leave this empty</label><input id="address" name="address" tabindex="-1" autocomplete="off"></div>
        <p class="error" hidden role="alert">That didn't send. Try again in a moment, or write to <a href="mailto:{INBOX}">{INBOX}</a>.</p>
        <button class="btn send" type="submit">Send message</button>
        <p class="note">We use what you send only to answer you. <a href="/privacy">Privacy Policy</a></p>
      </form>
      <div class="thanks" hidden tabindex="-1" aria-live="polite"><h2>Thanks.</h2><p>We have your message and will reply to <span class="to"></span>.</p></div>
      <noscript><p class="lead">Write to us at <a href="mailto:{INBOX}">{INBOX}</a>.</p></noscript>
    </div>
  </div>
</section>"""
    script = CONTACT_JS.replace("%COUNTRIES%", COUNTRIES).replace("%API%", API)
    return frame("Contact us", "Book a demo of Simeon, ask about plans, or tell us what you need. We will reply by e-mail.",
                 "/contact", body, CONTACT_CSS, current="contact", script=script)


def build(out=OUT):
    teams.copy_site_css(out)
    root = os.path.join(out, "contact")
    shutil.rmtree(root, ignore_errors=True)
    os.makedirs(root)
    open(f"{root}/index.html", "w", encoding="utf-8").write(version_style(page(), out))
    print(f"contact page written to {os.path.abspath(root)}")


if __name__ == "__main__":
    build()

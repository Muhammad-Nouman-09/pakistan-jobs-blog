import Link from "next/link";

export const metadata = {
  title: "Terms and Conditions — Pakistan Jobs Blog",
  description: "Terms and Conditions for Pakistan Jobs Blog."
};

export default function Terms() {
  return (
    <main className="page">
      <h1>Terms and Conditions</h1>
      <p className="muted">Please read these terms before using Pakistan Jobs Blog.</p>
      <h2>1. Information only</h2>
      <p>Job listings on this site are published for information only. We summarise the official advertisement; the official advertisement is the final word.</p>
      <h2>2. Always check the official ad</h2>
      <p>Before you apply, confirm the case number, qualification, quota, age limit and last date in the official advertisement on the official portal (for example fpsc.gov.pk or njp.gov.pk). If the official ad and this site disagree, the official ad wins.</p>
      <h2>3. No guarantee</h2>
      <p>We do not guarantee selection, shortlisting, an interview or employment. Applying through a link on this site does not create any employment relationship with us.</p>
      <h2>4. Never pay for a job</h2>
      <p>Never pay anyone — an agent, a person on WhatsApp, or anyone claiming to be from this blog or a government department — for a job, a test, or a selection. Genuine government recruitment never asks for a fee through an agent. If someone asks, do not pay, and report it through the <Link href="/contact">Contact Us</Link> page.</p>
      <h2>5. Employers must post genuine jobs</h2>
      <p>Employers may only post genuine vacancies, with truthful titles, counts, pay, eligibility and deadlines, and a working official apply link. Employers are verified by the admin before they can post. Fake, misleading or fee-charging ads will be removed, and the account may be suspended or deleted.</p>
      <h2>6. Accounts</h2>
      <p>You are responsible for keeping your account password safe and for what is done with your account. Job seekers register and are active immediately. Employers register as pending until the admin verifies them. The admin may suspend or delete accounts that break these terms.</p>
      <h2>7. Deadlines</h2>
      <p>Last dates are shown as published in the official ad at the time of posting. Departments can extend or cancel a recruitment; we are not responsible for a change made after publication, and we may leave a closed listing visible for reference.</p>
      <h2>8. Changes</h2>
      <p>We may change these terms, the listings, or the site at any time. The version on this page is the current one. If you do not agree with these terms, please do not use the site.</p>
    </main>
  );
}

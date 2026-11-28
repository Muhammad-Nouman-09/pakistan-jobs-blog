import Link from "next/link";

export const metadata = {
  title: "About Us — Pakistan Jobs Blog",
  description: "About Pakistan Jobs Blog: government and private jobs in Pakistan, checked by hand against official advertisements."
};

export default function About() {
  return (
    <main className="page">
      <h1>About Us</h1>
      <p>Pakistan Jobs Blog is a small, hand-checked job board for Pakistan — government jobs and private jobs, in one place.</p>
      <h2>What we do</h2>
      <p>We read the official advertisement before we post a job — the FPSC advertisement, the National Job Portal listing, the department&apos;s own notice, or the newspaper ad it came from. We post the real last date, the real number of posts, the pay scale, the education and age conditions, and a direct link to the official application. If we cannot verify a job against its official ad, we do not post it.</p>
      <h2>No agents, no fees, no middlemen</h2>
      <p>We never ask a job seeker to pay — not for a listing, not for an application, not for a &quot;guaranteed&quot; selection. No government department asks for money through an agent, JazzCash or WhatsApp to give you a job. If someone asks you for a fee in our name, walk away and apply only on the official portal linked in the job.</p>
      <h2>How the site works</h2>
      <p><b>Job seekers</b> can search and apply for free, and keep a CV / resume in their profile. <b>Employers</b> register and are verified by the admin before they can post a job — that check is there to keep fake ads off the board. The <b>admin</b> manages all listings, users and settings, and reads messages sent through the Contact Us page.</p>
      <h2>A note on dates</h2>
      <p>Deadlines are taken from the official ad. Where an advertisement states a deadline only as a number of days from publication, we work it out and say so in the listing — and we always tell you to confirm it in the official ad before you apply, because the official ad is the final word.</p>
      <p><Link className="btn btn-green" href="/find-jobs">Find Jobs →</Link> <Link className="btn btn-outline" href="/contact">Contact Us</Link></p>
    </main>
  );
}

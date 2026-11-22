import Link from "next/link";

export default function Footer() {
  return (
    <footer>
      <div className="container footer-grid">
        <div>
          <b>Pakistan Jobs Blog</b>
          <p>Government and private jobs in Pakistan, checked by hand against official advertisements. Always confirm the deadline and eligibility in the official ad before applying.</p>
        </div>
        <nav>
          <b>Jobs</b>
          <Link href="/">Home</Link><Link href="/find-jobs">Find Jobs</Link>
          <Link href="/admin">Post a Job</Link><Link href="/profile">My Profile / CV</Link>
        </nav>
        <nav>
          <b>Site</b>
          <Link href="/about">About Us</Link><Link href="/terms">Terms and Conditions</Link>
          <Link href="/contact">Contact Us</Link><Link href="/auth">Sign In / Join Free</Link>
          <Link href="/admin">Admin Panel</Link>
        </nav>
      </div>
    </footer>
  );
}

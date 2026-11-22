import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Pakistan Jobs Blog — Govt & Private Jobs in Pakistan",
  description: "The job board to find government and private jobs in Pakistan — every ad checked against the official advertisement, with the real last date and a direct official apply link."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Header />
          {children}
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}

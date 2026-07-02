import "./globals.css";
import NavBar from "./NavBar";

export const metadata = {
  title: "Rehab CEOs SEO Dashboard",
  description: "Live SEO dashboard for RCEOs Digital Marketing clients",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: "#f7f5f1", margin: 0 }}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}

import "./globals.css";

export const metadata = {
  title: "Rehab CEOs SEO Dashboard",
  description: "Live SEO dashboard for RCEOs Digital Marketing clients",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-black text-white font-manrope min-h-screen">
        {children}
      </body>
    </html>
  );
}

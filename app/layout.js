export const metadata = {
  title: 'SciPool UG — The National Data, Research and Project Repository for Young Scientific Talents',
  description: 'Uganda\'s national platform protecting young scientists\' research and connecting it to industry, investors and government.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

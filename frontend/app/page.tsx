import Nav from "@/components/Nav";
import Footer from "@/components/Footer";
import CookieBanner from "@/components/CookieBanner";
import SvgTemplates from "@/components/SvgTemplates";
import Hero from "@/components/sections/Hero";
import HighlightedText from "@/components/sections/HighlightedText";
import Exceptionalities from "@/components/sections/Exceptionalities";
import Features from "@/components/sections/Features";
import Products from "@/components/sections/Products";
import Steps from "@/components/sections/Steps";
import DataAndPrivacy from "@/components/sections/DataAndPrivacy";
import Faq from "@/components/sections/Faq";
import Decor from "@/components/sections/Decor";
import Integration from "@/components/sections/Integration";

export default function Page() {
  return (
    <>
      <div id="main">
        <div className="framer-Y1h2E framer-13xxj9k" data-layout-template="true" style={{minHeight: "100vh", width: "auto"}}>
          <Nav />
          <div data-framer-root="" className="framer-P0PnG framer-QATJw framer-k2isH framer-6lzSR framer-pbxdP framer-n3Cte framer-GeYI4 framer-ogaiyu" style={{minHeight: "100vh", width: "auto", display: "contents"}}>
          <Hero />
          <HighlightedText />
          <Exceptionalities />
          <Features />
          <Products />
          <Steps />
          <DataAndPrivacy />
          <Faq />
          <Decor />
          <Integration />
          </div>
          <div id="overlay" />
          <div className="framer-6to7uz" />
          <Footer />
          <CookieBanner />
        </div>
        <div id="template-overlay" />
      </div>
      <SvgTemplates />
    </>
  );
}

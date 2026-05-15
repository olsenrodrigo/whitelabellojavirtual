import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { ShoppingBag, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import About from "@/components/About";
import Services from "@/components/Services";
import Treatments from "@/components/Treatments";
import Differentials from "@/components/Differentials";
import Locations from "@/components/Locations";
import FAQ from "@/components/FAQ";
import HowItWorks from "@/components/HowItWorks";
import Contact from "@/components/Contact";
import Footer from "@/components/Footer";

export default function Home() {
  const [activeSection, setActiveSection] = useState("hero");

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    const sections = ["hero", "about", "services", "treatments", "differentials", "locations", "faq", "how-it-works", "contact"];
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { threshold: 0.3 }
    );

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar activeSection={activeSection} scrollToSection={scrollToSection} />
      <main>
        <Hero scrollToSection={scrollToSection} />
        <About />
        <Services />
        <Treatments />
        <Differentials />
        <Locations />
        <FAQ />
        <HowItWorks />
        <Contact />
        <StoreSection />
      </main>
      <Footer />
    </div>
  );
}

function StoreSection() {
  const [products, setProducts] = useState<any[]>([]);
  const [storeInfo, setStoreInfo] = useState<any>({});
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "start" });

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    fetch("/api/store/settings").then(r => r.json()).then(setStoreInfo).catch(() => {});
    // Try featured first, fall back to regular products
    fetch("/api/store/products?featured=true&limit=8")
      .then(r => r.json())
      .then(d => {
        const prods = d.products || [];
        if (prods.length > 0) {
          setProducts(prods);
        } else {
          return fetch("/api/store/products?limit=8&published=true")
            .then(r => r.json())
            .then(d2 => setProducts(d2.products || []));
        }
      })
      .catch(() => {
        fetch("/api/store/products?limit=8&published=true")
          .then(r => r.json())
          .then(d => setProducts(d.products || []))
          .catch(() => {});
      });
  }, []);

  if (products.length === 0) return null;

  const primaryColor = storeInfo.primaryColor || "#5B8C9B";

  return (
    <section id="loja" className="py-20" style={{ background: "#EDF2F4" }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag size={20} style={{ color: primaryColor }} />
              <span className="text-sm font-semibold uppercase tracking-wide" style={{ color: primaryColor }}>Loja Virtual</span>
            </div>
            <h2 className="text-3xl font-bold" style={{ color: "#2C3E50" }}>
              {storeInfo.storeName || "Nossa Loja"}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Carousel controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={scrollPrev}
                className="p-2 rounded-full border border-gray-300 hover:bg-white transition-colors"
                aria-label="Anterior"
              >
                <ChevronLeft size={18} className="text-gray-600" />
              </button>
              <button
                onClick={scrollNext}
                className="p-2 rounded-full border border-gray-300 hover:bg-white transition-colors"
                aria-label="Próximo"
              >
                <ChevronRight size={18} className="text-gray-600" />
              </button>
            </div>
            <Link href="/loja" className="flex items-center gap-2 text-sm font-semibold no-underline hover:opacity-80" style={{ color: primaryColor }}>
              Ver todos <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* Embla carousel */}
        <div className="overflow-hidden mb-10" ref={emblaRef}>
          <div className="flex gap-4">
            {products.map((p: any) => (
              <div key={p.id} className="flex-none w-64 sm:w-72">
                <Link href={`/loja/produto/${p.slug}`} className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 no-underline block">
                  <div className="aspect-square bg-gray-50 overflow-hidden">
                    {p.mainImage ? (
                      <img
                        src={p.mainImage}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-200">
                        <ShoppingBag size={40} />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-medium text-gray-800 line-clamp-2 mb-1 leading-snug min-h-[2.5rem]">{p.title}</p>
                    <p className="text-base font-bold" style={{ color: primaryColor }}>
                      R$ {Number(p.price).toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/loja"
            className="inline-flex items-center gap-2 px-8 py-3 rounded-full text-white font-semibold text-sm hover:opacity-90 transition-opacity no-underline"
            style={{ background: primaryColor }}
          >
            <ShoppingBag size={18} /> Acessar a loja completa
          </Link>
        </div>
      </div>
    </section>
  );
}
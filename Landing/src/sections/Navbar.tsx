import Image from "next/image";
import Button from "@/components/Button";
import DFIcon from "@/assets/images/DF.png"

const navLinks = [
    { label: "Home", href: "#" },
    { label: "Features", href: "#features" },
    { label: "Integrations", href: "#integrations" },
    { label: "FAQs", href: "#faqs" },
];

export default function Navbar() {
    return <section className="py-4 lg:py-8">
        <div className="container max-w-5xl">
            <div className="grid grid-cols-2 lg:grid-cols-3 border border-white/15 rounded-full p-2 px-4 md:pr-2 items-center">
                <div className="flex items-center gap-2">
                    <Image
                    className="h-9 w-auto ml-2" src={DFIcon}
                    alt="DailyFix logo"/>

                    <p className="text-white/80 text-[1.25rem] font-medium">DailyFix</p>
                </div>

                <nav className="hidden lg:flex gap-6 font-medium">
                    {navLinks.map((link) => (
                        <a href={link.href} key={link.label}>{link.label}</a>
                    ))}
                </nav>

                <div className="flex justify-end gap-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="feather feather-menu mr-2 md:hidden"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    <Button variant="secondary" className="hidden md:inline-flex items-center">Log In</Button>
                    <Button variant="primary" className="hidden md:inline-flex items-center">Sign Up</Button>
                </div>

            </div>
        </div>

    </section>;
}

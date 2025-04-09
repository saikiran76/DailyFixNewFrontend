"use client";
import Tag from "@/components/Tag";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
const faqs = [
    {
        question: "How is DailyFix stands out?",
        answer: "Unlike traditional design tools, Layers prioritizes speed and simplicity without sacrificing power. Our intelligent interface adapts to your workflow, reducing clicks and keeping you in your creative flow.",
    },
    {
        question: "Is it free?",
        answer: "Layers is designed to feel intuitive from day one. Most designers are productive within hours, not weeks. We also provide interactive tutorials and comprehensive documentation to help you get started.",
    },
    {
        question: "How do I connect my social media platforms?",
        answer: "Every change in Layers is automatically saved and versioned. You can review history, restore previous versions, and create named versions for important milestones.",
    },
    {
        question: "How do I get started?",
        answer: "Yes! Layers includes a robust offline mode. Changes sync automatically when you're back online, so you can keep working anywhere.",
    },
    {
        question: "How does DailyFix handle collaboration?",
        answer: "Layers is built for collaboration. You can invite team members to your projects, share feedback, and work together in real-time.",
    },
];

export default function Faqs() {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    return (
        <section className="py-24">
            <div className="container">
                <div className="flex justify-center items-center">
                    <Tag>
                        FAQs
                    </Tag>
                </div>

                <h2 className="text-center max-w-xl mx-auto font-medium text-6xl mt-6">
                    Questions? We&apos;ve got <span className="text-lime-400">answers</span>
                </h2>

                <div className="flex flex-col gap-6 mt-12">

                    {
                        faqs.map((faq, faqIndex) => (
                            <div className="bg-neutral-900 rounded-2xl p-6 border border-white/10" key={faqIndex}>
                                <div className="">
                                    <div className="flex justify-center items-center">
                                        <h3 className="font-medium ">{faq.question}</h3>
                                        <svg onClick={() => setSelectedIndex(faqIndex)} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className={`feather feather-plus text-lime-400 flex-shrink-0 ${selectedIndex === faqIndex ? "rotate-45" : ""}`}><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    </div>
                                </div>

                                <div className={twMerge("mt-4", selectedIndex !== faqIndex && "hidden")}>
                                <p className="text-white/50">{faq.answer}</p>
                                </div>
                            </div>
                        ))
                    }

                </div>

            </div>
        </section>
    );
}

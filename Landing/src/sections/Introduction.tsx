import Tag from "@/components/Tag";

const text = ` Juggling with your multiple social multiple messaging platforms spending more time to check every single context? Worry No more, Just use our Dashboard to Prioritize, analyze every platforms context`;

export default function Introduction() {
    return (
        <section className="py-28 lg:py-40">
            <div className="container">
                <div className="flex justify-center">
                <Tag>Introducing DailyFix</Tag>
                </div>

                <div className="text-4xl md:text-6xl lg:text-7xl text-center font-medium mt-10">
                    <span>All your messaging platforms analysis at one single place.</span>
                    <span className="text-white/15">{text}</span>
                    <span className="text-blue-700 block">That&apos;s why we built DailyFix.</span>

                </div>
            </div>
        </section>
    )
}

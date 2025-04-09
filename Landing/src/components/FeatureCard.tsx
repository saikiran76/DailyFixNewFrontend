import { twMerge } from "tailwind-merge";
import { HTMLAttributes } from "react";

export default function FeatureCard(props:HTMLAttributes<HTMLDivElement> &{
    title:string;
    description:string;
    children?:React.ReactNode; 
}) {
    const { title, description, children, className} = props;
    return (
        <div className={twMerge("bg-neutral-900 border border-white/10 p-6 rounded-3xl", className)}>
            <div>
                <div className="aspect-video">{children}</div>
                <div>
                    <h3 className="text-3xl font-medium mt-6">{title}</h3>
                    <p className="text-white/60 mt-3">{description}</p>
                </div>
            </div>
        </div>
    )
}
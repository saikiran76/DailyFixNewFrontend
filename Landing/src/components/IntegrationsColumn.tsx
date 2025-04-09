'use client';

import Image from "next/image";
import { twMerge } from "tailwind-merge";
import { IntegrationType } from "@/sections/Integrations";

export default function IntegrationsColumn(props: {
    integrations: IntegrationType,
    className?: string
}) {
    const {integrations, className} = props;
    return (
        <div className={twMerge("flex flex-col gap-6 pb-4 md:gap-4 mt-3 md:mt-0", className)}>
            {integrations.map((integration)=>(
                <div className="bg-neutral-900 rounded-3xl p-6 border border-white/20" key={integration.name}>
                    <div className="flex justify-center">
                        <Image className="size-24" src={integration.icon} alt={integration.name} />
                    </div>
                    <h3 className="text-3xl text-center mt-6">{integration.name}</h3>
                    <p className="text-center text-white/50 mt-2">{integration.description}</p>
                </div>
            ))}
        </div>

    )
}
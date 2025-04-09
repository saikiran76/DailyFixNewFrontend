'use client'; 

import Tag from "@/components/Tag";
import IntegrationsColumn from "@/components/IntegrationsColumn";
// import figmaIcon from '@/assets/images/figma-logo.svg'
// import notionIcon from "@/assets/images/notion-logo.svg"
import slackIcon from "@/assets/images/slack-logo.svg"
import whatsappIcon from "@/assets/images/wsapp.jpg"
import twitterIcon from "@/assets/images/twitter.jpeg"
// import discordIcon from "@/assets/images/discord.png"
// import relumeIcon from "@/assets/images/relume-logo.svg"
// import framerIcon from "@/assets/images/framer-logo.svg"
// import githubIcon from "@/assets/images/github-logo.svg"

import { motion } from "framer-motion";

const integrations = [
    { name: "Whatsapp", icon: whatsappIcon, description: "Whatsapp is a collaborative interface design tool." },
    { name: "X (Twitter)",icon: twitterIcon, description: "X is a social media platform." },
    { name: "Slack", icon: slackIcon, description: "Slack is a powerful team communication platform." },
    // { name: "Relume",icon: relumeIcon, description: "Relume is a no-code website builder and design system." },
    // { name: "Framer",icon: framerIcon, description: "Framer is a professional website prototyping tool." },
    // { name: "GitHub",icon: githubIcon, description: "GitHub is the leading platform for code collaboration." },
];

export type IntegrationType = typeof integrations;

export default function Integrations() {
    return <section className="py-24 overflow-hidden">
        {/* animate first IntegrationsColumn to silding down and the next one to slide up */}
        <motion.div className="container">
            <div className="grid lg:grid-cols-2 lg:items-center lg:gap-16">
                <div>
                    <Tag>Integrations</Tag>
                    <h2 className="text-6xl font-medium mt-6">
                        Plays well with <span className="text-lime-400">others</span>
                    </h2>
                    <p className="text-white/50 text-lg mt-2">
                        Get your social media platforms working together at our dashboard. And leave the juggling to us.
                    </p>
                </div>
                <div className="h-[400px] lg:h-[800px] overflow-hidden grid md:grid-cols-2 gap-4 [mask-image:linear-gradient(to_bottom,black_2%,black_80%,transparent)]">
                    <motion.div 
                        initial={{ y: 0 }}
                        animate={{ 
                            y: [-800, 0]
                        }}
                        transition={{
                            duration: 15,
                            repeat: Infinity,
                            repeatType: "loop",
                            ease: "linear"
                        }}
                    >
                        <IntegrationsColumn integrations={[...integrations, ...integrations]} className="h-full"/>
                    </motion.div>
                    
                    <motion.div 
                        initial={{ y: -400 }}
                        animate={{ 
                            y: [0, -800]
                        }}
                        transition={{
                            duration: 15,
                            repeat: Infinity,
                            repeatType: "loop",
                            ease: "linear"
                        }}
                    >
                        <IntegrationsColumn integrations={[...integrations, ...integrations].reverse()} className="hidden md:flex"/>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    </section>;
}

"use client";

import Button from "@/components/Button";
import Pointer from "@/components/pointer";
import { FormEvent, useState } from "react";
import { navigateToApp } from "@/utils/appUrl";

export default function Hero() {
    const [email, setEmail] = useState("");

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        
        // Use the utility to navigate to the signup page with email parameter if provided
        navigateToApp("/signup", email ? { email } : {});
    };

    return(
    <section className="py-24 overflow-x-clip mb-[7rem]">
        <div className="container relative">
            {/* <div className="absolute -left-32 top-16 hidden lg:block w-[24rem] h-[24rem]">
                <Image src={designExampleImage} alt="Design Example 1" />
            </div>
            <div className="absolute -right-64 -top-16 hidden lg:block w-[24rem] h-[24rem] ">
                <Image src={designExampleImage2} alt="Design Example 2" />
            </div> */}

            <div className="absolute left-40 lg:top-[11rem] sm:hidden md:hidden lg:block">
                <Pointer name="Andrew" color="red" />
            </div>

            <div className="absolute right-40 -top-10 sm:hidden md:hidden lg:block">
                <Pointer name="Gwen" color="blue" />
            </div>
            <div className="flex justify-center">
                <div className="inline-flex py-1 px-3 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full text-sm font-medium text-black">
                    ✨Coming soon
                </div>
            </div>

            <h1 className="text-5xl md:text-7xl font-medium text-center mt-6 absolute z-2">
                Streamling communication with AI
            </h1>

            {/* <p className="text-center text-xl max-w-2xl mx-auto text-white/60 mt-8">
                Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quo.Lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam, quos. 
            </p> */}

            <form onSubmit={handleSubmit} className="flex border border-white/15 rounded-full py-2 left-[35%] lg:max-w-2xl mx-auto absolute mt-36">
                <input 
                    type="email"
                    placeholder="Enter your email"
                    className="bg-transparent px-4 md:flex-1 w-full"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <Button type="submit" variant="primary" size="sm" className="whitespace-nowrap mr-5">
                    Go
                </Button>
            </form>

         </div>

        
    </section>)
}

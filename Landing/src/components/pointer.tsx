import { twMerge } from "tailwind-merge"
// import Image from "next/image"
// import wsapp from "@/assets/images/wsapp.jpg"

export default function Pointer(props: {name: string, color?: string, image?: string}){
    return (
        <div>
            <div className="w-12 h-12 rounded-full">
            {/* <Image className="object-cover" src={props.image || wsapp} alt="wsapp" /> */}
            </div>
            <div className="absolute top-full left-full">
                <div className={twMerge("inline-flex rounded-full font-bold text-sm bg-blue-500 px-2 rounded-tl-none", props.color === "red" && "bg-red-500")}>{props.name}</div>
            </div>
        </div>
)
}
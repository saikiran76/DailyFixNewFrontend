import { ButtonHTMLAttributes } from "react";
import { cva } from "class-variance-authority";


const classes = cva('border h-12 rounded-full px-6 font-md', {
    variants:{
        variant:{
            primary:'bg-lime-400 text-neutral-950 border-lime-400',
            secondary:'border-white text-white bg-transparent'
        },
        size:{
            sm:'h-10',
            md:'text-md',
            lg:'text-lg'
        }
    }

})

export default function Button(props: { variant: "primary" | "secondary", size?: "sm" | "md" | "lg" } & ButtonHTMLAttributes<HTMLButtonElement>) {
    const {variant, className, size, ...rest} = props;
    return <button className={classes({variant:variant, size:size, className:className})} {...rest} />
}
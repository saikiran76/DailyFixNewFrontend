"use client";

import { ButtonHTMLAttributes } from "react";
import { cva } from "class-variance-authority";

const classes = cva('border h-12 rounded-full px-6 font-md transition-colors', {
    variants:{
        variant:{
            primary:'bg-lime-400 text-neutral-950 border-lime-400 hover:bg-lime-500 hover:border-lime-500',
            secondary:'border-white text-white bg-transparent hover:bg-white/10'
        },
        size:{
            sm:'h-10',
            md:'text-md',
            lg:'text-lg'
        }
    }
})

/**
 * Button component with primary/secondary variants
 */
export default function Button(props: { 
    variant: "primary" | "secondary", 
    size?: "sm" | "md" | "lg",
    onClick?: () => void 
} & ButtonHTMLAttributes<HTMLButtonElement>) {
    const {variant, className, size, onClick, ...rest} = props;
    
    return (
        <button 
            className={classes({variant, size, className})} 
            onClick={onClick}
            {...rest} 
        />
    );
}
"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { ReactNode, ButtonHTMLAttributes } from "react"

interface PillowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  color?: string
  darkColor?: string
  size?: "sm" | "md" | "lg"
  variant?: "filled" | "outline"
  fullWidth?: boolean
}

const sizeClasses = {
  sm: "px-5 py-2 text-sm",
  md: "px-8 py-3 text-base",
  lg: "px-10 py-4 text-lg",
}

export function PillowButton({
  children,
  color = "var(--maestro-green)",
  darkColor = "var(--maestro-green-dark)",
  size = "md",
  variant = "filled",
  fullWidth = false,
  className,
  disabled,
  ...props
}: PillowButtonProps) {
  if (variant === "outline") {
    return (
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={cn(
          "relative font-bold rounded-2xl border-2 transition-colors cursor-pointer",
          sizeClasses[size],
          fullWidth && "w-full",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        style={{
          borderColor: color,
          color: color,
          backgroundColor: "transparent",
        }}
        disabled={disabled}
        {...props}
      >
        {children}
      </motion.button>
    )
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ y: 2 }}
      className={cn(
        "relative font-bold rounded-2xl border-b-4 active:border-b-0 active:mt-1 transition-all cursor-pointer select-none",
        sizeClasses[size],
        fullWidth && "w-full",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      style={{
        backgroundColor: color,
        borderBottomColor: darkColor,
        color: "#FFFFFF",
      }}
      disabled={disabled}
      {...props}
    >
      {children}
    </motion.button>
  )
}

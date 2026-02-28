import Image from "next/image";

export interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
}

export function Logo({ width = 96, height = 96, className }: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="PublicAI Foundry"
      width={width}
      height={height}
      className={className}
      priority
    />
  );
}

interface IconProps extends React.SVGProps<SVGSVGElement> {
  iconOnly?: boolean;
}

export default function Logo({ iconOnly = false, ...props }: IconProps) {
  return (
    <div className="flex justify-center">
      <img src="/extalk.png" alt="ExTalk" height={iconOnly ? 40 : 100} width={iconOnly ? 40 : 100} />
    </div>
  );
}

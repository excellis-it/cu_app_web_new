import cn from '@/utils/class-names';

interface RolesGridProps {
  className?: string;
  gridClassName?: string;
}

export default function RolesGrid({
  className,
  gridClassName,
}: RolesGridProps) {
  return (
    <div className={cn('@container', className)}>
      <div
        className={cn(
          'grid grid-cols-1 gap-6 @[36.65rem]:grid-cols-2 @[56rem]:grid-cols-3 @[78.5rem]:grid-cols-4 @[100rem]:grid-cols-5',
          gridClassName
        )}
      >

      </div>
    </div>
  );
}

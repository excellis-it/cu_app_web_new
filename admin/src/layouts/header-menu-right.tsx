
import ProfileMenu from './profile-menu';

export default function HeaderMenuRight() {
  return (
    <div className="ms-auto grid shrink-0 grid-cols-4 items-center gap-2 text-gray-700 xs:gap-3 xl:gap-4 ">
      <ProfileMenu />
    </div>
  );
}

'use client';

import { Title, Text, Avatar, Button, Popover } from 'rizzui';
import cn from '@/utils/class-names';
import { routes } from '@/config/routes';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuthContext } from '@/context/authContext';

export default function ProfileMenu({
  buttonClassName,
  avatarClassName,
  username = false,
}: {
  buttonClassName?: string;
  avatarClassName?: string;
  username?: boolean;
}) {
  const { user } = useAuthContext();

  return (
    <ProfileMenuPopover>
      <Popover.Trigger>
        <button style={{display: 'flex', alignItems: 'center'}}
          className={cn(
            'w-9 shrink-0 rounded-full outline-none focus-visible:ring-[1.5px] focus-visible:ring-gray-400 focus-visible:ring-offset-2 active:translate-y-px sm:w-10',
            buttonClassName
          )}
        >
          <Avatar
            src={(user?.image && user?.image) || ''}
            name={user?.name || ''}
            className={cn('!h-9 w-9 sm:!h-10 sm:!w-10', avatarClassName)}
          />
          
          {user?.name && (
            <div className='ms-4'>
              <span className="text-black-200 dark:text-black-700 md:flex" >
                {user?.name || ''}
              </span>
              <span className="text-black-200 dark:text-black-700 md:flex" >
                {user?.email || ''}
              </span>
            </div>
          )}
        </button>
      </Popover.Trigger>


      <Popover.Content className="z-[9999] p-0 dark:bg-gray-100 [&>svg]:dark:fill-gray-100">
        <DropdownMenu />
      </Popover.Content>
    </ProfileMenuPopover>
  );
}

function ProfileMenuPopover({ children }: React.PropsWithChildren<{}>) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <Popover
      isOpen={isOpen}
      setIsOpen={setIsOpen}
      shadow="sm"
      placement="bottom-end"
    >
      {children}
    </Popover>
  );
}

const menuItems: any[] = [
  {
    name: 'My Profile',
    // href: routes.profile,
    href: '/profile',
  },
  {
    name: 'Settings',
    // href: routes.forms.profileSettings,
    href: '/settings',
  },
  // {
  //   name: 'Activity Log',
  //   href: '#',
  // },
];

function DropdownMenu() {
  const { user, setUser } = useAuthContext();
  const router = useRouter();
  // console.log(user)

  const signOut = async (e: any) => {
    e.preventDefault();

    try {
      const response = await fetch(
        '/api/admin/users/logout',
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (response.ok) {
        localStorage.removeItem('access-token');
        localStorage.removeItem('user-type');
        setUser(null);
        router.push('/signin');
      } else {
        console.error('Failed to log out');
      }
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };
  
  return (
    <div className="w-64 text-left rtl:text-right">
      <div className="flex items-center border-b border-gray-300 px-6 pb-5 pt-6">
        <Avatar
          src={(user?.image && user?.image) || ''}
          name={user?.name || ''}
        />
        <div className="ms-3">
          <Title as="h6" className="font-semibold">
            {user?.name}
          </Title>
          <Text className="text-gray-600">{user?.email}</Text>
        </div>
      </div>
      <div className="grid px-3.5 py-3.5 font-medium text-gray-700">
        {menuItems.map((item, key) => (
          <Link
            key={item.name}
            href={item.href}
            className="group my-0.5 flex items-center rounded-md px-2.5 py-2 hover:bg-gray-100 focus:outline-none hover:dark:bg-gray-50/50"
          >
            {item.name}
          </Link>
        ))}
      </div>
      <div className="border-t border-gray-300 px-6 pb-6 pt-5">
        <Button
          className="h-auto w-full justify-start p-0 font-medium text-gray-700 outline-none focus-within:text-gray-600 hover:text-gray-900 focus-visible:ring-0"
          variant="text"
          onClick={signOut}
        >
          Sign Out
        </Button>
      </div>
    </div>
  );
}

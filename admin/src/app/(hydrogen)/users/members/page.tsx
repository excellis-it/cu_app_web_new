"use client"
import Link from 'next/link';
import { routes } from '@/config/routes';
import PageHeader from '@/app/shared/page-header';
import React, { useEffect } from 'react';
import MembersTable from '@/components/(admin)/users/members/members-table';

const pageHeader = {
  title: 'All Members',
  breadcrumb: [
    {
      href: routes.users.dashboard,
      name: 'Users',
    },
    {
      href: routes.users.allUsers,
      name: 'Members',
    },
  ],
};

export default function AllUsers() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.title = 'Members';
    }
  }, []);
  return (
    <>
      <PageHeader title={pageHeader.title} breadcrumb={pageHeader.breadcrumb}>
        <div className="mt-4 flex items-center gap-3 @lg:mt-0">
          <Link
            href={routes.eCommerce.createProduct}
            className="w-full @lg:w-auto"
          >
          </Link>
        </div>
      </PageHeader>
        <MembersTable/>
    </>
  );
}

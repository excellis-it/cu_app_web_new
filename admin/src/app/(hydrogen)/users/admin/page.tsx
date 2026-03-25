"use client"
import Link from 'next/link';
import { routes } from '@/config/routes';
import PageHeader from '@/app/shared/page-header';
import React, { useEffect } from 'react';
import AdminTable from '@/components/(admin)/users/admin/admin-table';


const pageHeader = {
  title: 'All Admins',
  breadcrumb: [
    {
      href: routes.users.dashboard,
      name: 'Users',
    },
    {
      href: routes.users.allUsers,
      name: 'Admin',
    },
  ],
};

export default function AllUsers() {
  useEffect(() => {


    if (typeof window !== 'undefined') {
      document.title = 'Admin';
    }
  }, []);

  return (
    <>
      <PageHeader title={pageHeader.title} breadcrumb={pageHeader.breadcrumb}>
        <div className="mt-4 flex items-center gap-3 @lg:mt-0">
          <Link
            href={routes.eCommerce.createProduct}
            className="w-full @lg:w-auto"
          ></Link>
        </div>
      </PageHeader>
      <AdminTable />
    </>
  );
}

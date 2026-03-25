"use client"
import { routes } from '@/config/routes';
import PageHeader from '@/app/shared/page-header';
import React, { useEffect } from 'react';
import UsersTable from '@/components/(admin)/users/all-users/users-table';


const pageHeader = {
  title: 'All Users',
  breadcrumb: [
    {
      href: routes.users.dashboard,
      name: 'Users',
    },
    {
      href: routes.users.allUsers,
      name: 'All List',
    },
  ],
};

export default function AllUsers() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.title = 'All Users';
    }
  }, []);

  return (
    <>
      <PageHeader title={pageHeader.title} breadcrumb={pageHeader.breadcrumb} />
      <UsersTable />
    </>
  );
}

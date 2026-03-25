"use client"
import PageHeader from '@/app/shared/page-header';
import GroupsTable from '@/components/(admin)/groups/all-groups/groups-table';
import { metaObject } from '@/config/site.config';
import { useEffect } from 'react';

const pageHeader = {
  title: 'All Groups',
  breadcrumb: [
    {
      href: '/',
      name: 'Groups',
    },
    {
      name: 'All Groups',
    },
  ],
};

export default function BlankPage() {

  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.title = 'Groups';
    }
  }, []);
  return (
    <>
      <PageHeader title={pageHeader.title} breadcrumb={pageHeader.breadcrumb} />
      <GroupsTable />
    </>
  );
}

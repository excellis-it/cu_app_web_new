'use client';

import MetricCard from '@/components/cards/metric-card';
import { Text } from 'rizzui';
import cn from '@/utils/class-names';
import { BarChart, Bar, ResponsiveContainer } from 'recharts';
import useApi from '@/hooks/useApi';
import { useEffect, useState } from 'react';

export default function StatCards({ className }: { className?: string }) {
  const res = useApi('/api/admin/users/all-users', {}, 'POST');
  const res2 = useApi('/api/admin/groups/get-all', {}, 'POST');
  const [adminCount, setAdminCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [userType, setUserType] = useState<string | null>(localStorage.getItem('user-type'));
  useEffect(() => {
    if (res?.data?.data?.length > 0) {
      console.log(
        res.data.data.filter((item: any) => item.userType === 'Admin')
      );
      setAdminCount(
        res.data.data.filter((item: any) => item.userType === 'Admin').length
      );
      setUserCount(
        res.data.data.filter((item: any) => item.userType === 'Member').length
      );
    }
  }, [res]);
  const handleStorageChange = () => {
    setUserType(localStorage.getItem('user-type'));
  };

  useEffect(() => {
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [userType]);   
  if(userType === 'admin'){

    return (
      <div
        className={cn('grid grid-cols-1 gap-5 3xl:gap-8 4xl:gap-9', className)}
      >
        <MetricCard
          key={'mem'}
          title={'Total Members'}
          metric={userCount}
          rounded="lg"
          metricClassName="text-3xl mt-1"
          chartClassName="flex flex-col w-auto h-auto text-center"
          className="@container @7xl:text-[15px] [&>div]:items-end"
        />
        <MetricCard
          key={'grp'}
          title={'Total Groups'}
          metric={res2.data?.data?.length}
          rounded="lg"
          metricClassName="text-3xl mt-1"
          chartClassName="flex flex-col w-auto h-auto text-center"
          className="@container @7xl:text-[15px] [&>div]:items-end"
        />
      </div>
    );
  }else{
    return (
      <div
        className={cn('grid grid-cols-1 gap-5 3xl:gap-8 4xl:gap-9', className)}
      >
        <MetricCard
          key={'usr'}
          title={'Total Users'}
          metric={res?.data?.data?.length}
          rounded="lg"
          metricClassName="text-3xl mt-1"
          chartClassName="flex flex-col w-auto h-auto text-center"
          className="@container @7xl:text-[15px] [&>div]:items-end"
        />
        <MetricCard
          key={'mem'}
          title={'Total Members'}
          metric={userCount}
          rounded="lg"
          metricClassName="text-3xl mt-1"
          chartClassName="flex flex-col w-auto h-auto text-center"
          className="@container @7xl:text-[15px] [&>div]:items-end"
        />
        <MetricCard
          key={'adm'}
          title={'Total Admins'}
          metric={adminCount}
          rounded="lg"
          metricClassName="text-3xl mt-1"
          chartClassName="flex flex-col w-auto h-auto text-center"
          className="@container @7xl:text-[15px] [&>div]:items-end"
        />
        <MetricCard
          key={'grp'}
          title={'Total Groups'}
          metric={res2.data?.data?.length}
          rounded="lg"
          metricClassName="text-3xl mt-1"
          chartClassName="flex flex-col w-auto h-auto text-center"
          className="@container @7xl:text-[15px] [&>div]:items-end"
        />
      </div>
    );
  }
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTable } from '@/hooks/use-table';
import { useColumn } from '@/hooks/use-column';
import ControlledTable from '@/components/controlled-table';
import { getColumns } from './columns';
import useApi from '@/hooks/useApi';
import { useAuthContext } from '@/context/authContext';
import toast from 'react-hot-toast';
const FilterElement = dynamic(() => import('./filter-element'), { ssr: false });
const TableFooter = dynamic(() => import('@/app/shared/table-footer'), {
  ssr: false,
});

const filterState = {
  role: '',
  status: '',
};

export default function UsersTable() {
  const [pageSize, setPageSize] = useState(10);
  const [userData, setUserData] = useState([]);
  const { user, token } = useAuthContext();
  const { data, error, refresh } = useApi(
    '/api/admin/users/all-users',
    {},
    'POST'
  );

  const getAllUserFn = async () => {
    const fetchUsers = async () => {
      const response = await fetch('/api/admin/users/all-users', {
        method: 'POST',
        headers: { 'access-token': token },
        
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    };
    fetchUsers()
      .then((data: any) => {
        if (data.data?.length > 0) {
          setUserData(data.data);
        }
      })
      .catch((error) => {
        console.error(error);
      });

  };

  useEffect(() => {
    if (data.data?.length > 0) {
      setUserData(data.data);
    }
  }, [data]);
  const onHeaderCellClick = (value: string) => ({
    onClick: () => {
      handleSort(value);
    },
  });

  const onDeleteItem = useCallback((id: string) => {
    const deleteSingleUser = async () => {
      const response = await fetch(`/api/admin/users/delete-user?id=${id}`, {
        method: 'DELETE',
        headers: { 'access-token': token },
      });


      if (!response.status) {
        throw new Error(`Error: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    };
    deleteSingleUser()
      .then((data: any) => {
        if (data.data.statusCode === 200) {
          getAllUserFn();
          toast.success(data.data.statusText);
        }
      })
      .catch((error) => {
        console.error(error);
        toast.error(data.data.statusText);
      });

  }, []);

  const {
    isLoading,
    isFiltered,
    tableData,
    currentPage,
    totalItems,
    handlePaginate,
    filters,
    updateFilter,
    searchTerm,
    handleSearch,
    sortConfig,
    handleSort,
    selectedRowKeys,
    setSelectedRowKeys,
    handleRowSelect,
    handleSelectAll,
    handleDelete,
    handleReset,
  } = useTable(userData, pageSize, filterState);

  const columns = useMemo(
    () =>
      getColumns({
        data: userData,
        sortConfig,
        checkedItems: selectedRowKeys,
        onHeaderCellClick,
        onDeleteItem,
        onChecked: handleRowSelect,
        handleSelectAll,
        refresh: Function,
        getAllUserFn,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      selectedRowKeys,
      onHeaderCellClick,
      sortConfig.key,
      sortConfig.direction,
      onDeleteItem,
      handleRowSelect,
      handleSelectAll,
    ]
  );

  const { visibleColumns, checkedColumns, setCheckedColumns } =
    useColumn(columns);

  return (
    <>
      <div className="mt-14">
        <FilterElement
          data={userData}
          isFiltered={isFiltered}
          filters={filters}
          updateFilter={updateFilter}
          handleReset={handleReset}
          onSearch={handleSearch}
          searchTerm={searchTerm}
          refresh={refresh}
        />
        <ControlledTable
          variant="modern"
          data={tableData}
          isLoading={isLoading}
          showLoadingText={true}
          // @ts-ignore
          columns={visibleColumns}
          paginatorOptions={{
            pageSize,
            setPageSize,
            total: totalItems,
            current: currentPage,
            onChange: (page: number) => handlePaginate(page),
          }}
          tableFooter={
            <TableFooter
              checkedItems={selectedRowKeys}
              handleDelete={(ids: string[]) => {
                setSelectedRowKeys([]);
                handleDelete(ids);
              }}
            />
          }
          className="overflow-hidden rounded-md border border-muted text-sm shadow-sm [&_.rc-table-placeholder_.rc-table-expanded-row-fixed>div]:h-60 [&_.rc-table-placeholder_.rc-table-expanded-row-fixed>div]:justify-center [&_.rc-table-row:last-child_td.rc-table-cell]:border-b-0 [&_thead.rc-table-thead]:border-t-0"
        />
      </div>
    </>
  );
}

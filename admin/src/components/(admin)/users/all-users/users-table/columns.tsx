'use client';

import { STATUSES, type User } from '@/data/users-data';
import { Text, Badge, Tooltip, Checkbox, ActionIcon } from 'rizzui';
import { HeaderCell } from '@/components/ui/table';
import PencilIcon from '@/components/icons/pencil';
import AvatarCard from '@/components/ui/avatar-card';
import DateCell from '@/components/ui/date-cell';
import DeletePopover from '@/app/shared/delete-popover';
import { useModal } from '@/app/shared/modal-views/use-modal';
import EditUser from '../../edit-user';

function getStatusBadge(status: User['accountStatus']) {
  switch (status) {
    
    case STATUSES.Active:
      return (
        <div className="flex items-center">
          <Badge color="success" renderAsDot />
          <Text className="ms-2 font-medium text-green-dark">{status}</Text>
        </div>
      );
    case STATUSES.Inactive:
      return (
        <div className="flex items-center">
          <Badge renderAsDot className="bg-gray-400" />
          <Text className="ms-2 font-medium text-gray-600">{status}</Text>
        </div>
      );
    default:
      return (
        <div className="flex items-center">
          <Badge renderAsDot className="bg-gray-400" />
          <Text className="ms-2 font-medium text-gray-600">{status}</Text>
        </div>
      );
  }
}

type Columns = {
  data: any[];
  sortConfig?: any;
  handleSelectAll: any;
  checkedItems: string[];
  onDeleteItem: (id: string) => void;
  onHeaderCellClick: (value: string) => void;
  onChecked?: (id: string) => void;
  refresh: Function;
  getAllUserFn: Function;
};

export const getColumns = ({
  data,
  sortConfig,
  checkedItems,
  onDeleteItem,
  onHeaderCellClick,
  handleSelectAll,
  onChecked,
  refresh,
  getAllUserFn,
}: Columns) => [
  {
    title: (
      <HeaderCell
        title="Name"
        sortable
        ascending={
          sortConfig?.direction === 'asc' && sortConfig?.key === 'name'
        }
      />
    ),
    dataIndex: 'name',
    onHeaderCell: () => onHeaderCellClick('name'),
    key: 'name',
    width: 250,
    // hidden: 'name',
    render: (_: string, user: User) => (
      <AvatarCard src={user.image} name={user.name} description={user.email} />
    ),
  },

  {
    title: (
      <HeaderCell
        title="User Type"
        sortable
        ascending={
          sortConfig?.direction === 'asc' && sortConfig?.key === 'userType'
        }
      />
    ),
    onHeaderCell: () => onHeaderCellClick('userType'),
    dataIndex: 'userType',
    key: 'userType',
    width: 250,
    render: (role: string) => role,
  },
  {
    title: (
      <HeaderCell
        title="Created"
        sortable
        ascending={
          sortConfig?.direction === 'asc' && sortConfig?.key === 'createdAt'
        }
      />
    ),
    onHeaderCell: () => onHeaderCellClick('createdAt'),
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 200,
    render: (value: Date) => <DateCell date={value} />,
  },
  {
    title: <HeaderCell title="Status" />,
    dataIndex: 'accountStatus',
    key: 'accountStatus',
    width: 120,
    render: (status: User['accountStatus']) => getStatusBadge(status),
  },
  {
    title: <HeaderCell title="Actions" />,
    dataIndex: 'action',
    key: 'action',
    width: 140,
    render: (_: string, user: any) => {
      return (
        <div className="flex items-center justify-start gap-3 pe-3">
          {user.userType !== 'Super Admin' && (
            <>
              <EditUserIcon
                refresh={refresh}
                id={user._id}
                getAllUserFn={getAllUserFn}
              />
              <DeletePopover
                getAllUserFn={getAllUserFn}
                title={`Delete this user`}
                description={`Are you sure you want to delete this user?`}
                onDelete={() => onDeleteItem(user._id)}
                id={user._id}
              />
            </>
          )}
        </div>
      );
    },
  },
];

const EditUserIcon = (props: {
  refresh: Function;
  id: string;
  getAllUserFn: Function;
}) => {
  const { openModal } = useModal();
  return (
    <Tooltip size="sm" content={'Edit User'} placement="top" color="invert">
      <ActionIcon
        as="span"
        size="sm"
        variant="outline"
        className="cursor-pointer hover:!border-gray-900 hover:text-gray-700"
        onClick={() =>
          openModal({ view: <EditUser {...props} />, customSize: '1100px' })
        }
      >
        <PencilIcon className="h-4 w-4" />
      </ActionIcon>
    </Tooltip>
  );
};

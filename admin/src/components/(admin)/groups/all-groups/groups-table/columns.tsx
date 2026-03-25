'use client';

import { Badge, Tooltip, ActionIcon } from 'rizzui';
import { HeaderCell } from '@/components/ui/table';
import PencilIcon from '@/components/icons/pencil';
import AvatarCard from '@/components/ui/avatar-card';
import DateCell from '@/components/ui/date-cell';
import DeletePopover from '@/app/shared/delete-popover-group';
import { Group, GroupUser } from '@/types';
import EditGroup from '../edit-group';
import { useModal } from '@/app/shared/modal-views/use-modal';

type Columns = {
  data: any[];
  sortConfig?: any;
  handleSelectAll: any;
  checkedItems: string[];
  onDeleteItem: (id: string) => void;
  onHeaderCellClick: (value: string) => void;
  onChecked?: (id: string) => void;
  refresh: Function;
  getAllGroupFn: Function;
};

export const getColumns = ({
  sortConfig,
  onDeleteItem,
  onHeaderCellClick,
  refresh,
  getAllGroupFn,
}: Columns) => [
  {
    title: (
      <HeaderCell
        title="Name"
        sortable
        ascending={
          sortConfig?.direction === 'asc' && sortConfig?.key === 'groupName'
        }
      />
    ),
    onHeaderCell: () => onHeaderCellClick('groupName'),
    dataIndex: 'groupName',
    key: 'groupName',
    width: 250,
    render: (_: string, group: Group) => (
      <AvatarCard
        src={group.groupImage}
        name={group.groupName}
        description={group.groupDescription}
      />
    ),
  },
  {
    title: <HeaderCell title="Members" />,
    dataIndex: 'currentUsers',
    key: 'currentUsers',
    width: 250,
    render: (users: GroupUser[]) => (
      <div className="flex items-center gap-2">
        {users.slice(0, 3).map((user) => (
          <Badge
            key={user._id}
            rounded="lg"
            variant="outline"
            className="border-muted font-normal text-gray-500"
          >
            {user.name}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    title: (
      <HeaderCell
        title="Number of Members"
        sortable
        ascending={
          sortConfig?.direction === 'asc' &&
          sortConfig?.key === 'currentUsers.length'
        }
      />
    ),
    onHeaderCell: () => onHeaderCellClick('currentUsers.length'),
    dataIndex: 'currentUsers.length',
    key: 'currentUsers.length',
    width: 250,
    render: (_: string, group: Group) => <p>{group.currentUsers?.length}</p>,
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
    title: <HeaderCell title="Actions" />,
    dataIndex: 'action',
    key: 'action',
    width: 140,
    render: (_: string, group: Group) => {
      return (
        <div className="flex items-center justify-start gap-3 pe-3">
          <EditGroupIcon refresh={refresh} id={group._id} />
          <DeletePopover
            getAllGroupFn={getAllGroupFn}
            title={`Delete this group`}
            description={`Are you sure you want to delete this group?`}
            onDelete={() => onDeleteItem(group._id)}
            id={group._id}
          />
        </div>
      );
    },
  },
];

const EditGroupIcon = (props: { refresh: Function; id: string }) => {
  const { openModal } = useModal();
  return (
    <Tooltip size="sm" content={'Edit Group'} placement="top" color="invert">
      <ActionIcon
        as="span"
        size="sm"
        variant="outline"
        className="cursor-pointer hover:!border-gray-900 hover:text-gray-700"
        onClick={() =>
          openModal({ view: <EditGroup {...props} />, customSize: '1100px' })
        }
      >
        <PencilIcon className="h-4 w-4" />
      </ActionIcon>
    </Tooltip>
  );
};

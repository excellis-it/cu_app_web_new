import { Title, Text, ActionIcon, Button, Popover } from 'rizzui';
import TrashIcon from '@/components/icons/trash';
import { PiTrashFill } from 'react-icons/pi';
import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuthContext } from '@/context/authContext';
import { io, Socket } from 'socket.io-client';

type DeletePopoverProps = {
  getAllGroupFn: Function;
  title: string;
  description: string;
  onDelete: (setOpen: (value: boolean) => void) => void;
  id: string;
};

export default function DeletePopover({
  getAllGroupFn,
  title,
  description,
  onDelete,
  id,
}: DeletePopoverProps) {
  const { user, token } = useAuthContext();
  const socketRef = useRef<Socket | null>(null); // Moved inside the component body
   useEffect(() => {
     
      // Initialize the socket connection
      socketRef.current = io(process.env.NEXT_PUBLIC_SOCKET_URL as string);
    }, []);
  const deleteSingleGroup = useCallback(
    async (setOpen: (value: boolean) => void) => {
      try {
        const response = await fetch(
          `/api/admin/groups/delete-group?id=${id}`,
          {
            method: 'DELETE',
            headers: { 'access-token': token },
          }
        );


        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`);
        }

        const data: any = await response.json();

        if (data.data.statusCode === 200) {
          socketRef?.current?.emit('deleteGroup', data.data.deleteGroupResult);
          getAllGroupFn();
          setOpen(false);
          toast.success(data.data.statusText);
        }
      } catch (error: any) {
        console.error(error);
        toast.error(error.message);
      }
    },
    [id, getAllGroupFn]
  );

  return (
    <Popover placement="left">
      <Popover.Trigger>
        <ActionIcon
          size="sm"
          variant="outline"
          aria-label={'Delete Item'}
          className="cursor-pointer hover:!border-gray-900 hover:text-gray-700"
        >
          <TrashIcon className="h-4 w-4" />
        </ActionIcon>
      </Popover.Trigger>
      <Popover.Content className="z-0">
        {({ setOpen }) => (
          <div className="w-56 pb-2 pt-1 text-left rtl:text-right">
            <Title
              as="h6"
              className="mb-0.5 flex items-start text-sm text-gray-700 sm:items-center"
            >
              <PiTrashFill className="me-1 h-[17px] w-[17px]" /> {title}
            </Title>
            <Text className="mb-2 leading-relaxed text-gray-500">
              {description}
            </Text>
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                className="me-1.5 h-7"
                onClick={() => {
                  deleteSingleGroup(setOpen);
                }}
              >
                Yes
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setOpen(false)}
              >
                No
              </Button>
            </div>
          </div>
        )}
      </Popover.Content>
    </Popover>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { PiXBold } from 'react-icons/pi';
import { Controller, SubmitHandler, useForm } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { Input, Button, ActionIcon, Title, Text } from 'rizzui';
import { useModal } from '@/app/shared/modal-views/use-modal';
import callApi from '@/helpers/callApi';
import toast from 'react-hot-toast';
import FormGroup from '@/app/shared/form-group';
import UploadZone from '@/components/file-upload/upload-zone';
import {
  CreateGroupInput,
  createGroupSchema,
} from '@/utils/validators/create-group.schema';
import useApi from '@/hooks/useApi';
import { UserOption } from '@/types';
import Select from 'react-select';
import { io, Socket } from 'socket.io-client';

export default function CreateGroup({
  refresh = () => {},
}: {
  refresh: Function;
}) {
  const { closeModal } = useModal();
  const [reset, setReset] = useState({});
  const [isLoading, setLoading] = useState(false);
  const [members, setMembers] = useState<UserOption[]>([]);
  const [admins, setAdmins] = useState<UserOption[]>([]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [selectedAdmin, setSelectedAdmin] = useState<any>();
  const [selectedMembers, setSelectedMembers] = useState<UserOption[]>([]);
  const { formState, setError } = useForm<CreateGroupInput>();
  const socketRef = useRef<Socket | null>(null); // Moved inside the component body
  const {
    data: { data:users},
    error,
  } = useApi('/api/admin/users/all-users', {}, 'POST');

  useEffect(() => {
    var members_: UserOption[] = [];
    var admins_: UserOption[] = [];
    if (users?.length > 0) {
      for (let user of users) {
       
        if (user.accountStatus !== 'Inactive') {
          if (user.userType === 'Admin') {
            admins_.push({ ...user, value: user._id, label: user?.name });
          }else if (user.userType === 'Member'){
          members_.push({ ...user, value: user._id, label: user?.name });
          }
        }
      }
      setMembers(members_);
      setAdmins(admins_);
    }
  }, [users]);

  //socket connection
  useEffect(() => {

    // Initialize the socket connection
    socketRef.current = io(process.env.NEXT_PUBLIC_SOCKET_URL as string);

  }, []);

  const onSubmit: SubmitHandler<CreateGroupInput> = async (data: any) => {

    const formData = new FormData();
    if (selectedImage) {
      formData.append('file', selectedImage);
    }
    formData.append('groupName', data.groupName);
    formData.append('groupDescription', data.groupDescription);
    const allUsers: UserOption[] = data?.members?data.members.concat(data?.admins?data.admins:[]):[];
    const users: string[] = [];
    for (let user of allUsers) {
      users.push(user._id);
    }
    formData.append(
      'admins',
      JSON.stringify(selectedAdmin?.map((adm: any) => adm._id))
    );
    formData.append('users', JSON.stringify(users));
    setLoading(true);
    try {
      let { data, success } = await callApi(
        '/api/groups/create',
        formData,
        'POST',
        { 'content-type': 'multipart/form-data' }
      );
      
      if (success) {
        toast.success('Group created successfully');
        socketRef?.current?.emit('creategroup', data.data);
        setReset({
          groupName: '',
          users: [],
        });
        closeModal();
        refresh();
      } else {
        if (data.error.code > 10000) {
          setError(data.error.field, {
            type: 'manual',
            message: data.error.message,
          });
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    }
    setLoading(false);
  };


  const handleAdminChange = (value: UserOption[]) => {
    setSelectedAdmin(value);
    const idsArray1 = value.map((user) => user._id);
    const newMembers = members.filter((user) => !idsArray1.includes(user._id));
    setMembers(newMembers);
  };

  const handleMembersChange = (values: UserOption[]) => {
    setSelectedMembers(values);
    setAdmins(
      admins.concat(members).filter((admin, index, self) => {
        return (
          values.findIndex((obj) => obj._id === admin._id) === -1 &&
          self.findIndex((obj) => obj._id === admin._id) === index &&
          admin.userType == 'Admin'
        );
      })
    );
  };

  if (users !== undefined && users.length === 0) {
    return (
      <div className="p-6 text-center">
        <Title as="h5">No users available to create a group</Title>
        <Text>Please add users or ensure users are active before creating a group.</Text>
        <Button onClick={closeModal} className="mt-4">
          Close
        </Button>
      </div>
    );
  }


  return (
    <>
      {users !== undefined && users?.length > 0 && (
        <Form<CreateGroupInput>
          resetValues={reset}
          onSubmit={onSubmit}
          validationSchema={createGroupSchema}
          className="grid grid-cols-1 gap-6 p-6 @container md:grid-cols-2 [&_.rizzui-input-label]:font-medium [&_.rizzui-input-label]:text-gray-900"
        >
          {({
            register,
            setError,
            control,
            watch,
            getValues,
            setValue,
            formState: { errors },
          }) => {
            return (
              <>
                <div className="col-span-full flex items-center justify-between">
                  <Title as="h4" className="font-semibold">
                    Add a new Group
                  </Title>
                  <ActionIcon size="sm" variant="text" onClick={closeModal}>
                    <PiXBold className="h-auto w-5" />
                  </ActionIcon>
                </div>
                <Input
                  label="Group Name"
                  placeholder="Enter a Group Name"
                  {...register('groupName')}
                  className="col-span-full"
                  error={
                    errors.groupName?.message ||
                    formState.errors.groupName?.message
                  }
                />
                <Input
                  label="Group Description"
                  placeholder="Enter a Group Description"
                  {...register('groupDescription')}
                  className="col-span-full"
                  error={
                    errors.groupName?.message ||
                    formState.errors.groupName?.message
                  }
                />
                {admins?.length > 0 && (
                  <Controller
                    name="admins"
                    control={control}
                    render={({ field: { onChange, value } }) => (
                      <div className={`${errors?.admins && 'is-invalid'}`}>
                        <label className="\[\&_\ rizzui-input-label\]\ rizzui-input-label text-gray-900">
                          Select A Group Admin
                        </label>
                        <Select
                          options={admins as any}
                          isMulti={true}
                          value={value}
                          placeholder="Select Admin"
                          onChange={(e: any) => {
                            handleAdminChange(e);
                            onChange && onChange(e);
                          }}
                        />
                        <p className="text-red-600">
                          {errors?.admins?.message?.toString()}
                        </p>
                      </div>
                    )}
                  />
                )}

                {members?.length > 0 && (
                  <Controller
                    name="members"
                    control={control}
                    render={({ field: { onChange, value } }) => (
                      <div>
                        <label className="\[\&_\ rizzui-input-label\]\ rizzui-input-label text-gray-900">
                          Select Group Members
                        </label>
                        <Select
                          isDisabled={selectedAdmin ? false : localStorage.getItem("user-type") === "admin" ? false : true}
                          isMulti={true}
                          placeholder="Select Members"
                          options={members as any}
                          value={value}
                          onChange={(e: any) => {
                            handleMembersChange(e);
                            onChange && onChange(e);
                          }}
                        />
                        <p className="text-red-600">
                          {errors?.admins?.message?.toString()}
                        </p>
                      </div>
                    )}
                  />
                )}
                <FormGroup
                  title="Group Image"
                  description="Add a Group Image here"
                  className="col-span-full pt-7 @2xl:pt-9 @3xl:grid-cols-12 @3xl:pt-11"
                >
                  <div className="mb-5 @3xl:col-span-2">
                    <UploadZone
                      name="groupImage"
                      getValues={getValues}
                      setValue={setValue}
                      error={errors?.groupImage?.message as string}
                      onChange={(file: File) => setSelectedImage(file)}
                    />
                  </div>
                </FormGroup>
                <div className="col-span-full flex items-center justify-end gap-4">
                  <Button
                    variant="outline"
                    onClick={closeModal}
                    className="w-full @xl:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    isLoading={isLoading}
                    className="w-full @xl:w-auto"
                  >
                    Create Group
                  </Button>
                </div>
              </>
            );
          }}
        </Form>
      )}
    </>
  );
}


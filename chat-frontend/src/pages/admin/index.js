import axios from 'axios';
import React, { useEffect, useState } from 'react';
import Select from 'react-select';  // Import the react-select component
import { PROXY } from '../../../config';

function Form() {
  const [users, setUsers] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const getAllUsers = async () => {
    const response = await axios.get(`${PROXY}/api/v1/users/get-all-users`);
    setUsers(response.data.data);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Perform form submission logic here
  setSelectedUserIds([]);
  setGroupName('');
} 

  useEffect(() => {
    getAllUsers();
  }, []);

  // Convert users array to options for react-select
  const userOptions = users.map((user) => ({
    value: user._id,
    label: user.name,
  }));

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
      <div>
        <h1>Create group</h1>
        <form onSubmit={handleSubmit}>
          <label>
            Group Name:
            <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </label>
          <br />
          <label>
            Select Users:
            <Select
              isMulti
              options={userOptions}
              value={userOptions.filter(option => selectedUserIds.includes(option.value))}
              onChange={(selectedOptions) => {
                setSelectedUserIds(selectedOptions.map(option => option.value));
              }}
            />
          </label>
          <br />
          <button type="submit">Submit</button>
        </form>
      </div>
      <div>
        <h1>Users</h1>
        <table style={{ width: "80%", borderCollapse: "collapse", margin: "20px" }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              {/* Add more table headers as needed */}
            </tr>
          </thead>
          <tbody>
            {users && users.map((user) => (
              <tr key={user._id} style={{ borderBottom: "1px solid #ddd", padding: "8px" }}>
                <td>{user._id}</td>
                <td>{user.name}</td>
                <td>{user.email}</td>
                {/* Add more table data cells as needed */}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Form;

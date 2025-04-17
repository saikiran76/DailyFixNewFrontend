import React, { useState, useEffect } from 'react';
import { useMatrixClient } from '../context/MatrixClientContext';
import matrixTimelineManager from '../utils/matrixTimelineManager';
import logger from '../utils/logger';

/**
 * Component to display room members in a list
 */
const RoomMemberList = ({ roomId, onClose }) => {
  const { client } = useMatrixClient() || {};
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredMembers, setFilteredMembers] = useState({
    joined: [],
    invited: []
  });

  // Load room members
  useEffect(() => {
    if (!client || !roomId) return;

    const loadMembers = async () => {
      setLoading(true);
      setError(null);

      try {
        // Initialize MatrixTimelineManager if not already initialized
        if (!matrixTimelineManager.initialized) {
          logger.info('[RoomMemberList] Initializing MatrixTimelineManager');
          const initialized = matrixTimelineManager.initialize(client);

          if (!initialized) {
            throw new Error('Failed to initialize MatrixTimelineManager');
          }
        }

        logger.info(`[RoomMemberList] Loading members for room ${roomId}`);

        // Load room members using MatrixTimelineManager
        const memberData = await matrixTimelineManager.loadRoomMembers(roomId, { forceRefresh: true });

        if (!memberData) {
          throw new Error('Failed to load room members');
        }

        // Combine joined and invited members
        const allMembers = [...memberData.joined, ...memberData.invited];

        logger.info(`[RoomMemberList] Loaded ${allMembers.length} members (${memberData.joined.length} joined, ${memberData.invited.length} invited)`);

        setMembers(allMembers);
        filterMembers(allMembers, searchQuery);
      } catch (err) {
        logger.error(`[RoomMemberList] Error loading members:`, err);
        setError(err.message || 'Failed to load room members');
      } finally {
        setLoading(false);
      }
    };

    loadMembers();
  }, [client, roomId]);

  // Filter members based on search query
  const filterMembers = (memberList, query) => {
    if (!memberList) return;

    const lowerQuery = query.toLowerCase();

    const filtered = {
      joined: [],
      invited: []
    };

    memberList.forEach(member => {
      // Skip if doesn't match search
      if (query && !member.name.toLowerCase().includes(lowerQuery) &&
          !member.userId.toLowerCase().includes(lowerQuery)) {
        return;
      }

      if (member.membership === 'invite') {
        filtered.invited.push(member);
      } else if (member.membership === 'join') {
        filtered.joined.push(member);
      }
    });

    // Sort by power level then alphabetically
    const sortMembers = (a, b) => {
      if (a.powerLevel !== b.powerLevel) {
        return b.powerLevel - a.powerLevel; // Higher power levels first
      }
      return a.name.localeCompare(b.name);
    };

    filtered.joined.sort(sortMembers);
    filtered.invited.sort(sortMembers);

    setFilteredMembers(filtered);
  };

  // Handle search input change
  const handleSearchChange = (e) => {
    const query = e.target.value;
    setSearchQuery(query);
    filterMembers(members, query);
  };

  // Render member item
  const MemberItem = ({ member }) => (
    <div className="flex items-center p-3 hover:bg-neutral-800 rounded-lg transition-colors">
      <div className="mr-3 relative">
        {member.avatarUrl ? (
          <img
            src={member.avatarUrl}
            alt={member.name}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium">
            {member.name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Power level indicator for admins and moderators */}
        {member.powerLevel >= 100 && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            A
          </div>
        )}
        {member.powerLevel >= 50 && member.powerLevel < 100 && (
          <div className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            M
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-white truncate">{member.name}</div>
        <div className="text-xs text-gray-400 truncate">{member.userId}</div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-neutral-900 text-white">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center">
        <button
          onClick={onClose}
          className="mr-3 w-auto p-2 rounded-full hover:bg-neutral-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h2 className="text-lg font-medium">Members</h2>
      </div>

      {/* Search input */}
      <div className="p-4">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search members..."
            className="w-full bg-neutral-800 text-white rounded-lg px-4 py-2 pl-10 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-t-blue-500 border-blue-200 rounded-full animate-spin"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-red-500 text-4xl mb-4">⚠️</div>
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={() => loadMembers()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Joined members */}
            {filteredMembers.joined.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wider">
                  Members ({filteredMembers.joined.length})
                </h3>
                <div className="space-y-1">
                  {filteredMembers.joined.map(member => (
                    <MemberItem key={member.userId} member={member} />
                  ))}
                </div>
              </div>
            )}

            {/* Invited members */}
            {filteredMembers.invited.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wider">
                  Invited ({filteredMembers.invited.length})
                </h3>
                <div className="space-y-1">
                  {filteredMembers.invited.map(member => (
                    <MemberItem key={member.userId} member={member} />
                  ))}
                </div>
              </div>
            )}

            {filteredMembers.joined.length === 0 && filteredMembers.invited.length === 0 && (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="text-gray-500 text-4xl mb-4">👥</div>
                  <p className="text-gray-400">
                    {searchQuery ? 'No members match your search' : 'No members found'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomMemberList;

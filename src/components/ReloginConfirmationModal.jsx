import React, { useRef, useEffect, useState } from 'react';
import { useSocket } from '../utils/socket';
import { toast } from 'react-hot-toast';
import api from '../utils/api';
import logger from '../utils/logger';
import QRCode from 'qrcode';

const ReloginConfirmationModal = ({ isOpen, onClose, onConfirm }) => {
  const modalRef = useRef();
  const socket = useSocket();
  const [qrCode, setQrCode] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState(null);
  const [status, setStatus] = useState('initial'); // initial, connecting, qr_ready, connected, error

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!socket || !isOpen) return;

    // Listen for QR code events
    const handleQrCode = async (data) => {
      logger.info('[ReloginModal] Received QR code:', data);
      if (data.qr || data.qrcode || data.qrCode || data.bodyPreview) {
        const rawQrData = data.qr || data.qrcode || data.qrCode || data.bodyPreview;
        // Store the raw QR data
        setQrCode(rawQrData);
        
        try {
          // Generate QR code image - use the raw data as is since WhatsApp expects the complete format
          const qrImageUrl = await QRCode.toDataURL(rawQrData, {
            errorCorrectionLevel: 'L',
            margin: 2,
            width: 300
          });
          setQrCodeUrl(qrImageUrl);
          setStatus('qr_ready');
        } catch (error) {
          logger.error('[ReloginModal] Failed to generate QR code:', error);
          setStatus('error');
          toast.error('Failed to generate QR code');
        }
      } else {
        logger.warn('[ReloginModal] Received QR code event without QR data:', data);
      }
    };

    // Listen for connection status updates
    const handleStatus = (data) => {
      logger.info('[ReloginModal] Status update:', data);
      
      switch (data.state) {
        case 'connected':
        case 'active':
          setStatus('connected');
          if(data?.phoneNumber){
            toast.success(`WhatsApp reconnected successfully! Connected to ${data.phoneNumber}`);
          } else {
            toast.success('WhatsApp reconnected successfully!');
          }
          onConfirm();
          break;
          
        case 'connecting':
          // Only set connecting status if we don't have a QR code yet
          if (status !== 'qr_ready') {
            setStatus('connecting');
          }
          break;
          
        case 'qr_ready':
          setStatus('qr_ready');
          break;

        case 'qr_scanned':
          setStatus('connecting');
          toast.success('QR code scanned successfully! Connecting...');
          break;

        case 'puppet_sent':
          setStatus('connecting');
          break;
          
        case 'error':
          setStatus('error');
          toast.error(data.message || 'Failed to connect to WhatsApp');
          break;
          
        default:
          logger.warn('[ReloginModal] Unhandled state:', data.state);
          break;
      }
    };

    socket.on('whatsapp:qr', handleQrCode);
    socket.on('whatsapp:qrcode', handleQrCode);
    socket.on('whatsapp:setup:status', handleStatus);

    return () => {
      socket.off('whatsapp:qr', handleQrCode);
      socket.off('whatsapp:qrcode', handleQrCode);
      socket.off('whatsapp:status', handleStatus);
    };
  }, [socket, isOpen, onConfirm]);

  const handleRelogin = async () => {
    try {
      setStatus('connecting');
      const response = await api.post('api/v1/matrix/whatsapp/reconnect');
      
      if (response.data.status === 'error') {
        throw new Error(response.data.message);
      }

      logger.info('[ReloginModal] Relogin initiated:', response.data);
    } catch (error) {
      logger.error('[ReloginModal] Relogin error:', error);
      setStatus('error');
      toast.error(error.message || 'Failed to initiate reconnection');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50">
      <div 
        ref={modalRef}
        className="bg-[#24283b] rounded-lg p-6 max-w-md w-full mx-4"
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[1rem] font-medium text-white">Reconnect WhatsApp</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors w-auto"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {status === 'initial' && (
          <>
            <p className="text-gray-300 mb-6">
              <span className="font-bold mr-2">Note:</span>Only proceed if you logged out of WhatsApp on your phone.📴
            </p>

            <img src="https://static1.anpoimages.com/wordpress/wp-content/uploads/2023/02/use-whatsapp-multiple-devices-9.jpg" alt='Linked Devices' className='w-full h-[18rem] object-cover mb-6 mt-4' />
            <p className="text-gray-300 mb-6">
              You will need to scan a new QR code to reconnect your WhatsApp account. Would you like to proceed?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRelogin}
                className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/80 transition-colors"
              >
                Reconnect
              </button>
            </div>
          </>
        )}

        {status === 'connecting' && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-gray-300">Getting ready to reconnect... It might take a few minutes so dont close the window and, hang tight!</p>
          </div>
        )}

        {status === 'qr_ready' && qrCodeUrl && (
          <div className="text-center">
            <img 
              src={qrCodeUrl}
              alt="WhatsApp QR Code"
              className="mx-auto mb-4 max-w-[200px]"
            />
            <p className="text-gray-300">
              Scan this QR code with WhatsApp on your phone to reconnect
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <p className="text-red-500 mb-4">Failed to reconnect WhatsApp</p>
            <button
              onClick={handleRelogin}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/80 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {status === 'connected' && (
        <div className="text-center">
            <p className="text-green-500 mb-4">✅ WhatsApp reconnected successfully!</p>
            <div className="text-gray-300 space-y-3">
            <p>1. Send a message to a contact or wait to receive a message.</p>
            <p>2. Click "Refresh Contacts" in the contacts List to start re-syncing your contacts.</p>
            </div>
        </div>
        )}
      </div>
    </div>
  );
};

export default ReloginConfirmationModal;
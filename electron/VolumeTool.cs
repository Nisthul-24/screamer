using System;
using System.Runtime.InteropServices;

class VolumeTool {
  const int CLSCTX_ALL = 23;

  [DllImport("ole32.dll")]
  static extern int CoCreateInstance(
    [In] ref Guid rclsid,
    IntPtr pUnkOuter,
    uint dwClsContext,
    [In] ref Guid riid,
    out IntPtr ppv);

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    void EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    void GetDefaultAudioEndpoint(int dataFlow, int role, out IntPtr ppEndpoint);
    void GetDevice([MarshalAs(UnmanagedType.LPWStr)] string pwstrId, out IntPtr ppDevice);
    void RegisterEndpointNotificationCallback(IntPtr pClient);
    void UnregisterEndpointNotificationCallback(IntPtr pClient);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    void Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, out IntPtr ppInterface);
    void OpenPropertyStore(int stgmAccess, out IntPtr ppProperties);
    void GetId(out IntPtr ppstrId);
    void GetState(out int pdwState);
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF740782BAF"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    void RegisterControlChangeNotify(IntPtr pNotify);
    void UnregisterControlChangeNotify(IntPtr pNotify);
    void GetChannelCount(out uint pnChannelCount);
    void SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    void SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    void GetMasterVolumeLevel(out float pfLevelDB);
    void GetMasterVolumeLevelScalar(out float pfLevel);
    void SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    void SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    void GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    void GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    void SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    void GetMute(out bool pbMute);
    void GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    void VolumeStepUp(Guid pguidEventContext);
    void VolumeStepDown(Guid pguidEventContext);
    void QueryHardwareSupport(out uint pdwHardwareSupportMask);
    void GetVolumeRange(out float pflVolumeMinDB, out float pflVolumeMaxDB, out float pflVolumeIncrementDB);
  }

  static IAudioEndpointVolume GetEndpoint() {
    Guid clsid = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
    Guid iidEnum = typeof(IMMDeviceEnumerator).GUID;
    IntPtr pEnum;
    int hr = CoCreateInstance(ref clsid, IntPtr.Zero, CLSCTX_ALL, ref iidEnum, out pEnum);
    if (hr != 0 || pEnum == IntPtr.Zero)
      throw new Exception("CoCreateInstance failed: 0x" + hr.ToString("X8"));

    IMMDeviceEnumerator enumerator = (IMMDeviceEnumerator)Marshal.GetTypedObjectForIUnknown(pEnum, typeof(IMMDeviceEnumerator));
    Marshal.Release(pEnum);

    IntPtr pDevice;
    enumerator.GetDefaultAudioEndpoint(0, 1, out pDevice); // eRender, eMultimedia
    if (pDevice == IntPtr.Zero) throw new Exception("GetDefaultAudioEndpoint returned null");

    IMMDevice device = (IMMDevice)Marshal.GetTypedObjectForIUnknown(pDevice, typeof(IMMDevice));
    Marshal.Release(pDevice);

    Guid iidVol = typeof(IAudioEndpointVolume).GUID;
    IntPtr pVol;
    device.Activate(ref iidVol, CLSCTX_ALL, IntPtr.Zero, out pVol);
    if (pVol == IntPtr.Zero) throw new Exception("Activate returned null");

    IAudioEndpointVolume ep = (IAudioEndpointVolume)Marshal.GetTypedObjectForIUnknown(pVol, typeof(IAudioEndpointVolume));
    Marshal.Release(pVol);
    return ep;
  }

  static int Main(string[] args) {
    try {
      if (args.Length < 1) {
        Console.Error.WriteLine("Usage: VolumeTool get|set|getmute|setmute [value]");
        return 1;
      }
      string action = args[0].ToLowerInvariant();
      var ep = GetEndpoint();
      if (action == "get") {
        float level;
        ep.GetMasterVolumeLevelScalar(out level);
        Console.Write((int)Math.Round(level * 100.0));
        return 0;
      }
      if (action == "set") {
        int percent = int.Parse(args[1]);
        if (percent < 0) percent = 0;
        if (percent > 100) percent = 100;
        ep.SetMasterVolumeLevelScalar(percent / 100.0f, Guid.Empty);
        float level;
        ep.GetMasterVolumeLevelScalar(out level);
        Console.Write((int)Math.Round(level * 100.0));
        return 0;
      }
      if (action == "getmute") {
        bool mute;
        ep.GetMute(out mute);
        Console.Write(mute ? "1" : "0");
        return 0;
      }
      if (action == "setmute") {
        bool mute = args[1] == "1";
        ep.SetMute(mute, Guid.Empty);
        bool outMute;
        ep.GetMute(out outMute);
        Console.Write(outMute ? "1" : "0");
        return 0;
      }
      Console.Error.WriteLine("Unknown action");
      return 1;
    } catch (Exception ex) {
      Console.Error.WriteLine(ex.ToString());
      return 1;
    }
  }
}

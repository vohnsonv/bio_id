import com.integratedbiometrics.ibscanultimate.IBScan;
import com.integratedbiometrics.ibscanultimate.IBScanDevice;
import com.integratedbiometrics.ibscanultimate.IBScanDevice.ImageData;
import com.integratedbiometrics.ibscanultimate.IBScanDevice.ImageType;
import com.integratedbiometrics.ibscanultimate.IBScanDevice.ImageResolution;
import com.integratedbiometrics.ibscanultimate.IBScanListener;
import com.integratedbiometrics.ibscanultimate.IBScanDeviceListener;
import com.integratedbiometrics.ibscanultimate.IBScanException;
import java.util.Scanner;
import java.util.Base64;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import javax.imageio.ImageIO;
import java.io.ByteArrayOutputStream;

public class BioAgent implements IBScanListener, IBScanDeviceListener {
    private IBScan ibScan;
    private IBScanDevice ibScanDevice;
    private volatile int initProgress = 0;
    private final Object lock = new Object();

    public static void main(String[] args) {
        new BioAgent().run();
    }

    public void run() {
        try {
            ibScan = IBScan.getInstance();
            ibScan.setScanListener(this);
            
            if (ibScan.getDeviceCount() > 0) {
                ibScanDevice = ibScan.openDevice(0);
                ibScanDevice.setScanDeviceListener(this);
            } else {
                System.out.println("ERROR_NO_DEVICE");
                return;
            }

            // ESPERA CALIBRAÇÃO (Igual ao programa oficial)
            while (initProgress < 100) {
                Thread.sleep(100);
            }
            
            // AGORA SIM ESTAMOS PRONTOS
            System.out.println("READY");

            Scanner stdin = new Scanner(System.in);
            while (stdin.hasNextLine()) {
                String cmd = stdin.nextLine();
                if (cmd.equals("CAPTURE")) {
                    try {
                        ibScanDevice.beginCaptureImage(ImageType.FLAT_SINGLE_FINGER, ImageResolution.RESOLUTION_500, 3);
                    } catch (IBScanException e) {
                        System.out.println("ERROR_START_" + e.getType().toString());
                    }
                } else if (cmd.equals("EXIT")) {
                    break;
                }
            }
        } catch (Exception e) {
            System.out.println("ERROR_" + e.getMessage());
        }
    }

    @Override public void scanDeviceInitProgress(int deviceIndex, int progress) {
        this.initProgress = progress;
    }

    @Override public void deviceImageResultAvailable(IBScanDevice device, ImageData image, ImageType imageType, ImageData[] splitImageArray) {
        try {
            BufferedImage img = new BufferedImage(image.width, image.height, BufferedImage.TYPE_BYTE_GRAY);
            byte[] data = ((DataBufferByte) img.getRaster().getDataBuffer()).getData();
            System.arraycopy(image.buffer, 0, data, 0, image.buffer.length);
            
            BufferedImage rotated = new BufferedImage(image.width, image.height, BufferedImage.TYPE_BYTE_GRAY);
            for (int y = 0; y < image.height; y++) {
                for (int x = 0; x < image.width; x++) {
                    rotated.setRGB(image.width - 1 - x, image.height - 1 - y, img.getRGB(x, y));
                }
            }
            
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(rotated, "png", baos);
            String b64 = Base64.getEncoder().encodeToString(baos.toByteArray());
            
            System.out.println("SUCCESS_" + b64);
        } catch (Exception e) {
            System.out.println("ERROR_CONVERSION");
        }
    }

    // Métodos obrigatórios da interface
    @Override public void scanDeviceCountChanged(int deviceCount) {}
    @Override public void scanDeviceOpenComplete(int deviceIndex, IBScanDevice device, IBScanException exception) {}
    @Override public void deviceCommunicationBroken(IBScanDevice device) { System.out.println("DISCONNECTED"); System.exit(0); }
    @Override public void deviceImagePreviewAvailable(IBScanDevice device, ImageData image) throws IBScanException {}
    @Override public void deviceFingerCountChanged(IBScanDevice device, IBScanDevice.FingerCountState state) {}
    @Override public void deviceFingerQualityChanged(IBScanDevice device, IBScanDevice.FingerQualityState[] states) {}
    @Override public void deviceAcquisitionBegun(IBScanDevice device, ImageType type) {}
    @Override public void deviceAcquisitionCompleted(IBScanDevice device, ImageType type) {}
    @Override public void deviceImageResultExtendedAvailable(IBScanDevice device, IBScanException exception, ImageData image, ImageType type, int count, ImageData[] splitArray, IBScanDevice.SegmentPosition[] positions) {}
    @Override public void devicePlatenStateChanged(IBScanDevice device, IBScanDevice.PlatenState state) {}
    @Override public void deviceWarningReceived(IBScanDevice device, IBScanException exception) {}
    @Override public void devicePressedKeyButtons(IBScanDevice device, int buttons) {}
}

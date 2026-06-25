#include "runtime.h"

int main(void) {
    TSC_INIT();
    TscAbortController controller = tsc_abort_controller_create();
    const TscAbortSignal *signal = controller.signal;
    printf("%s\n", (tsc_abort_signal_aborted(signal)) ? "true" : "false");
    tsc_abort_controller_abort(&controller);
    printf("%s\n", (tsc_abort_signal_aborted(signal)) ? "true" : "false");
    tsc_abort_controller_free(&controller);
    return 0;
}

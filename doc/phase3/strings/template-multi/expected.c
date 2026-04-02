#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t a = 2;
    const int32_t b = 3;
    String msg = tsc_string_format("%d + %d = %d", a, b, a + b);
    printf("%s\n", msg.data);
    tsc_string_free(msg);
    return 0;
}

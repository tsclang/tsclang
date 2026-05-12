#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String s = STR_LIT("ABC");
    printf("%u\n", (unsigned)(uint8_t)s.data[0]);
    return 0;
}

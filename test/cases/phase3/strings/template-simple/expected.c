#include "runtime.h"

int main(void) {
    TSC_INIT();
    const String name = STR_LIT("World");
    String msg = tsc_string_concat(STR_LIT("hello "), name);
    printf("%s\n", msg.data);
    tsc_string_free(msg);
    return 0;
}

#include "runtime.h"

void log_string(String msg) {
    printf("%s\n", msg.data);
}

void log_string_i32(String msg, int32_t level) {
    printf("%s\n", msg.data);
}

int main(void) {
    TSC_INIT();
    log_string(STR_LIT("hello"));
    log_string_i32(STR_LIT("world"), 1);
    return 0;
}

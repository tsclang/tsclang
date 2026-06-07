#include "runtime.h"

int main(void) {
    TSC_INIT();
    bool a = true ^ false;
    bool b = true ^ true;
    printf("%s\n", (a) ? "true" : "false");
    printf("%s\n", (b) ? "true" : "false");
    return 0;
}

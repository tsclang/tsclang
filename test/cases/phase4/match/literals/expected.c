#include "runtime.h"

int main(void) {
    TSC_INIT();
    const int32_t x = 5;
    String result;
    if (x == 0) { result = STR_LIT("zero"); }
    else if (x >= 1 && x <= 4) { result = STR_LIT("small"); }
    else { result = STR_LIT("other"); }
    printf("%s\n", result.data);
    return 0;
}
